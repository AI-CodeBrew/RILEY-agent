// Shared terminal-state resolution for a Vapi call — used by both
// vapi-webhook-handler (driven by the "end-of-call-report" webhook) and
// reconcile-live-calls (driven by polling Vapi's GET /call/:id directly).
// Both paths describe the same Vapi "call" resource, just via different
// envelopes, so this takes a normalized shape either caller can build.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import { computeNextRetryAt } from "./campaign-schedule.ts";

export type CallOutcome =
  | "appointment_set"
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "call_back_later"
  | "error";

export interface VapiCallLike {
  id?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  durationSeconds?: number;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  analysis?: { structuredData?: Record<string, unknown>; summary?: string };
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    recording?: { stereoUrl?: string; mono?: { combinedUrl?: string } };
  };
  metadata?: { customerId?: string; agentId?: string; campaignId?: string | null };
}

function outcomeFromEndedReason(endedReason: string | undefined): CallOutcome {
  const reason = (endedReason ?? "").toLowerCase();
  if (reason === "voicemail" || reason.includes("voicemail")) return "voicemail";
  if (
    reason.includes("no-answer") ||
    reason.includes("did-not-answer") ||
    reason.includes("busy") ||
    reason.includes("silence-timed-out")
  ) {
    return "no_answer";
  }
  if (reason.includes("error") || reason.includes("pipeline")) return "error";
  return "call_back_later";
}

export function customerStatusForOutcome(outcome: CallOutcome, followUpNeeded?: boolean) {
  if (followUpNeeded || outcome === "call_back_later" || outcome === "no_answer") {
    return "follow_up";
  }
  switch (outcome) {
    case "appointment_set":
      return "appointment_set";
    case "not_interested":
      return "not_interested";
    case "voicemail":
      return "no_answer";
    default:
      return "contacted";
  }
}

/**
 * Decides whether/when this customer should be auto-redialed, given a
 * `follow_up` or `no_answer` outcome — a two-tier model:
 *
 *   - Within a retry *cycle*, up to `retry_max_attempts` immediate redials
 *     of this *same* customer fire `call_gap_seconds` apart — the same
 *     cadence used between different customers. These are placed by the
 *     campaign's own sequential loop (lib/campaign.ts::advanceCampaign),
 *     not the cron: the caller here keeps the customer's
 *     dial_campaign_customers row `pending` (via the returned
 *     `immediateRetry` flag) instead of releasing it, so the campaign
 *     redials this exact customer before ever moving on to the next one.
 *   - Once a cycle is exhausted, the customer is released from the
 *     campaign's active queue and backed off `retry_cycle_delay_minutes`
 *     before another cycle (retry_count resets to 0 for it) — from here on
 *     the process-retries cron places the dial directly.
 *   - This keeps going until `retry_max_days` have elapsed since
 *     `retry_cycle_started_at` (the first attempt of the *current* run of
 *     cycles), at which point auto-retry gives up for good.
 *
 * `retry_max_attempts` counts redials per cycle, not counting whatever call
 * (the campaign's original dial, or a previous cycle's last retry) started
 * the chain — this keeps every cycle's shape identical regardless of what
 * preceded it, rather than special-casing the very first one.
 *
 * The clamp is the *campaign's* own windows and end_date (dial_campaign_
 * windows / dial_campaigns.end_date — see
 * 00000000000030_campaign_date_range_and_windows.sql), i.e. whichever
 * auto-dial campaign placed the original call. A manual, non-campaign dial
 * has no windows to clamp into and gets no auto-retry — same limitation as
 * the original pre-schedule-panel design, and consistent with leaving any
 * leftover, never-reached customer for the agent to handle by hand.
 */
async function nextRetryPatch({
  supabase,
  customerId,
  campaignId,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  campaignId: string | null;
}): Promise<{
  next_retry_at: string | null;
  retry_campaign_id: string | null;
  retry_count?: number;
  retry_cycle_started_at?: string | null;
  /** True when the next attempt is an immediate, same-cycle redial of this
   * *same* customer (short call_gap_seconds delay) — the caller uses this to
   * keep the customer's dial_campaign_customers row active (`pending`)
   * instead of releasing it, so the campaign's own sequential loop redials
   * them next rather than moving on to a different customer first. False
   * once the cycle is exhausted (long retry_cycle_delay_minutes handoff to
   * the process-retries cron) or no further retry is possible at all. */
  immediateRetry: boolean;
}> {
  if (!campaignId) return { next_retry_at: null, retry_campaign_id: null, immediateRetry: false };

  const [{ data: customer }, { data: campaign }, { data: campaignMember }] = await Promise.all([
    supabase
      .from("customers")
      .select("retry_count, retry_cycle_started_at")
      .eq("id", customerId)
      .maybeSingle(),
    supabase.from("dial_campaigns").select("agent_id, end_date, timezone").eq("id", campaignId).maybeSingle(),
    // "dialing" means the campaign's own sequential loop placed *this* call
    // and is still actively working this customer — anything else (already
    // "completed", i.e. released to the cron in an earlier cycle) means a
    // *later* cycle's dial came from process-retries instead, which has no
    // loop to hand back to, so every one of its retries — immediate-cadence
    // or not — has to stay cron-driven from here on.
    supabase
      .from("dial_campaign_customers")
      .select("status")
      .eq("campaign_id", campaignId)
      .eq("customer_id", customerId)
      .maybeSingle(),
  ]);
  const wasActiveCampaignDial = campaignMember?.status === "dialing";

  if (!campaign) return { next_retry_at: null, retry_campaign_id: campaignId, immediateRetry: false };

  const [{ data: agent }, { data: windows }] = await Promise.all([
    supabase
      .from("sales_agents")
      .select("timezone, call_gap_seconds, retry_max_attempts, retry_cycle_delay_minutes, retry_max_days")
      .eq("id", campaign.agent_id)
      .maybeSingle(),
    supabase.from("dial_campaign_windows").select("start_time, end_time").eq("campaign_id", campaignId),
  ]);

  if (!agent) return { next_retry_at: null, retry_campaign_id: campaignId, immediateRetry: false };

  const now = new Date();
  const cycleStartedAt = customer?.retry_cycle_started_at
    ? new Date(customer.retry_cycle_started_at)
    : now;
  const daysElapsed = (now.getTime() - cycleStartedAt.getTime()) / (24 * 60 * 60 * 1000);

  if (daysElapsed >= agent.retry_max_days) {
    // Max redial duration reached — stop for good, leave it for a human.
    return {
      next_retry_at: null,
      retry_campaign_id: campaignId,
      retry_cycle_started_at: cycleStartedAt.toISOString(),
      immediateRetry: false,
    };
  }

  const attemptsThisCycle = customer?.retry_count ?? 0;
  const cycleHasAttemptsLeft = attemptsThisCycle < agent.retry_max_attempts;
  const delayMinutes = cycleHasAttemptsLeft
    ? agent.call_gap_seconds / 60
    : agent.retry_cycle_delay_minutes;
  // This is the one place that advances retry_count — both for a campaign-
  // placed immediate retry (dial_campaign_customers flipping back to
  // "pending" below commits the campaign to placing it on its very next
  // tick) and for a cron-placed one (app/api/cron/process-retries only
  // clears next_retry_at after dialing; it doesn't touch the count itself).
  const nextRetryCount = cycleHasAttemptsLeft ? attemptsThisCycle + 1 : 0;

  const nextRetryAt = computeNextRetryAt({
    now,
    // The campaign's own browser-detected zone (see 00000000000031) takes
    // precedence over the agent's account timezone setting, matching
    // whatever clock the agent actually picked these windows against.
    timezone: campaign.timezone ?? agent.timezone,
    windows: windows ?? [],
    endDate: campaign.end_date,
    delayMinutes,
  });

  // Only ever true for a call the campaign's own loop just placed — once a
  // customer has been released to the cron in an earlier cycle, *every*
  // later retry (immediate-cadence or not) has to stay cron-driven, since
  // there's no active loop left to hand back to.
  const immediateRetry = wasActiveCampaignDial && cycleHasAttemptsLeft && nextRetryAt !== null;

  return {
    // Left unarmed only for a genuine immediate retry — the campaign's own
    // loop is handling it directly, and arming this too would let the
    // process-retries cron race it into a second, duplicate dial attempt
    // for the same customer. Every other case (released this cycle, or
    // already cron-driven from an earlier one) gets a real wake-up time,
    // since the cron is the only thing left that can place it.
    next_retry_at: immediateRetry ? null : nextRetryAt ? nextRetryAt.toISOString() : null,
    retry_campaign_id: campaignId,
    retry_count: nextRetryCount,
    retry_cycle_started_at: cycleStartedAt.toISOString(),
    immediateRetry,
  };
}

/**
 * Applies the terminal state for a call that has genuinely ended in Vapi:
 * updates (or inserts, if the local row doesn't exist yet) the `calls` row,
 * patches `customers.status`, and clears campaign bookkeeping. Idempotent —
 * safe to call more than once for the same call (e.g. webhook + reconcile
 * both landing).
 */
export async function resolveCallOutcome(call: VapiCallLike) {
  const supabase = getSupabaseAdmin();

  const vapiCallId = call.id;
  const customerId = call.metadata?.customerId;
  const agentId = call.metadata?.agentId;
  const metadataCampaignId = call.metadata?.campaignId ?? null;

  const transcript = call.transcript ?? call.artifact?.transcript;
  const recordingUrl =
    call.recordingUrl ??
    call.artifact?.recordingUrl ??
    call.artifact?.recording?.stereoUrl ??
    call.artifact?.recording?.mono?.combinedUrl;

  const structured = call.analysis?.structuredData ?? {};
  const structuredOutcome = structured.outcome as CallOutcome | undefined;
  const endedReason = call.endedReason;
  let outcome = structuredOutcome ?? outcomeFromEndedReason(endedReason);
  if (endedReason?.toLowerCase().includes("voicemail")) {
    outcome = "voicemail";
  }
  const followUpNeeded = structured.follow_up_needed === true;
  const summary = call.analysis?.summary ?? call.summary;

  const callInsights: Record<string, unknown> = {
    outcome,
    call_received:
      outcome === "voicemail" || outcome === "no_answer"
        ? false
        : ((structured.call_received as boolean | null | undefined) ?? null),
    letter_received: structured.letter_received ?? null,
    mailing_address_confirmed: structured.mailing_address_confirmed ?? null,
    mailing_address_correction: structured.mailing_address_correction ?? null,
    spouse_name: structured.spouse_name ?? null,
    household_type: structured.household_type ?? null,
    employment_status: structured.employment_status ?? null,
    preferred_meeting_time: structured.preferred_meeting_time ?? null,
    slots_offered: structured.slots_offered ?? null,
    meeting_locked_time: structured.meeting_locked_time ?? null,
    appointment_with: structured.appointment_with ?? null,
    appointment_at: structured.appointment_at ?? null,
    email_confirmed: structured.email_confirmed ?? null,
    email_same_as_file: structured.email_same_as_file ?? null,
    // Notes only — like mailing_address_correction below, never written to
    // customers.email automatically. A misheard "spelling" could otherwise
    // silently overwrite a correct address; a human reviews it first.
    email_correction: structured.email_correction ?? null,
    pre_meeting_call_agreed:
      structured.pre_meeting_call_agreed ?? structured.tyler_callback_agreed ?? null,
    follow_up_needed: followUpNeeded,
    key_notes: structured.key_notes ?? summary ?? null,
  };

  const durationSeconds =
    call.durationSeconds ??
    (call.startedAt && call.endedAt
      ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
      : null);
  const cost = call.cost ?? null;

  if (!vapiCallId && !customerId) {
    return { ok: false as const, error: "no vapi call id or customerId metadata on call" };
  }

  // Only consult the appointments table when Vapi's own analysis didn't give
  // a reliable outcome (e.g. reconcile-live-calls polling before analysis
  // finished computing) — never second-guess a real structuredData.outcome,
  // "not_interested" included, or a repeat-tested customer's earlier booking
  // gets misattributed to this call. When it does need to guess, appointments
  // has no call_id to join on, so the lookup is bounded to this call's own
  // start/end window (plus a short buffer) rather than an open lookback.
  if (customerId && !structuredOutcome && call.startedAt) {
    const windowStart = call.startedAt;
    const windowEnd = new Date(
      (call.endedAt ? new Date(call.endedAt).getTime() : Date.now()) + 5 * 60 * 1000
    ).toISOString();

    const { data: recentAppointment } = await supabase
      .from("appointments")
      .select("scheduled_at, notes")
      .eq("customer_id", customerId)
      .eq("status", "confirmed")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentAppointment) {
      outcome = "appointment_set";
      callInsights.outcome = "appointment_set";
      if (!callInsights.appointment_at) callInsights.appointment_at = recentAppointment.scheduled_at;
      if (!callInsights.meeting_locked_time) callInsights.meeting_locked_time = recentAppointment.scheduled_at;
      if (!callInsights.key_notes && recentAppointment.notes) callInsights.key_notes = recentAppointment.notes;
    }
  }

  let updateQuery = supabase
    .from("calls")
    .update({
      transcript: transcript ?? null,
      recording_url: recordingUrl ?? null,
      outcome,
      status: "ended",
      ended_reason: endedReason ?? null,
      duration_seconds: durationSeconds,
      cost,
      summary: summary ?? null,
      call_insights: callInsights,
    })
    .select("id, customer_id, agent_id, campaign_id");

  updateQuery = vapiCallId
    ? updateQuery.eq("vapi_call_id", vapiCallId)
    : updateQuery.eq("customer_id", customerId!).is("outcome", null);

  const { data: updatedCalls, error: updateError } = await updateQuery;

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  let resolvedCustomerId = customerId;
  let campaignId: string | null = null;
  if (updatedCalls?.[0]) {
    resolvedCustomerId = updatedCalls[0].customer_id;
    campaignId = updatedCalls[0].campaign_id ?? null;
  }

  if ((!updatedCalls || updatedCalls.length === 0) && resolvedCustomerId) {
    await supabase.from("calls").insert({
      customer_id: resolvedCustomerId,
      agent_id: agentId ?? null,
      vapi_call_id: vapiCallId ?? null,
      campaign_id: metadataCampaignId,
      transcript: transcript ?? null,
      recording_url: recordingUrl ?? null,
      outcome,
      status: "ended",
      ended_reason: endedReason ?? null,
      duration_seconds: durationSeconds,
      cost,
      summary: summary ?? null,
      call_insights: callInsights,
    });
    campaignId = metadataCampaignId;
  }

  // True only for a genuine immediate, same-cycle retry — set below, used
  // after the customer patch to decide whether this campaign member stays
  // active (redialed next by the campaign's own sequential loop) or gets
  // released (handed off to the process-retries cron for a later cycle, or
  // done for good on a terminal outcome).
  let immediateRetry = false;

  if (resolvedCustomerId) {
    const newStatus = customerStatusForOutcome(outcome, followUpNeeded);
    const customerPatch: Record<string, unknown> = {
      status: newStatus,
      last_contacted_at: new Date().toISOString(),
      call_insights: callInsights,
      last_call_summary: summary ?? null,
    };
    if (structured.spouse_name) customerPatch.spouse_name = structured.spouse_name;
    if (structured.household_type) customerPatch.household_type = structured.household_type;
    if (structured.employment_status) customerPatch.employment_status = structured.employment_status;
    if (structured.preferred_meeting_time) customerPatch.preferred_meeting_time = structured.preferred_meeting_time;
    if (followUpNeeded) customerPatch.follow_up_at = new Date().toISOString();

    if (newStatus === "follow_up" || newStatus === "no_answer") {
      const retryPatch = await nextRetryPatch({ supabase, customerId: resolvedCustomerId, campaignId });
      immediateRetry = retryPatch.immediateRetry;
      const { immediateRetry: _unused, ...retryFields } = retryPatch;
      Object.assign(customerPatch, retryFields);
    } else {
      // A fresh, non-retry outcome (answered, booked, not interested, ...)
      // clears any armed retry timer and resets the attempt count so a
      // later follow_up/no_answer starts a brand new retry cycle/day-window
      // from zero.
      customerPatch.next_retry_at = null;
      customerPatch.retry_count = 0;
      customerPatch.retry_campaign_id = null;
      customerPatch.retry_cycle_started_at = null;
    }

    await supabase.from("customers").update(customerPatch).eq("id", resolvedCustomerId);
  }

  if (campaignId && resolvedCustomerId) {
    // Only release this member from the campaign's active queue when it
    // isn't about to be redialed immediately — an immediate retry instead
    // goes back to "pending" so the campaign's own sort_order loop redials
    // this *same* customer (paced by its existing gap_seconds check) before
    // ever moving on to a different one. The `.eq("status", "dialing")`
    // guard means this only ever affects the row the campaign itself just
    // dialed — a call the process-retries cron placed for an
    // already-released member (status already "completed") is left alone.
    await supabase
      .from("dial_campaign_customers")
      .update({ status: immediateRetry ? "pending" : "completed" })
      .eq("campaign_id", campaignId)
      .eq("customer_id", resolvedCustomerId)
      .eq("status", "dialing");

    await supabase
      .from("dial_campaigns")
      .update({ current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  return { ok: true as const, outcome, campaignId };
}

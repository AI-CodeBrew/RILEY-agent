// Shared terminal-state resolution for a Vapi call — used by both
// vapi-webhook-handler (driven by the "end-of-call-report" webhook) and
// reconcile-live-calls (driven by polling Vapi's GET /call/:id directly).
// Both paths describe the same Vapi "call" resource, just via different
// envelopes, so this takes a normalized shape either caller can build.

import { getSupabaseAdmin } from "./supabase-admin.ts";

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

  if (customerId && outcome !== "appointment_set") {
    const { data: recentAppointment } = await supabase
      .from("appointments")
      .select("scheduled_at, notes")
      .eq("customer_id", customerId)
      .eq("status", "confirmed")
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
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

  if (resolvedCustomerId) {
    const customerPatch: Record<string, unknown> = {
      status: customerStatusForOutcome(outcome, followUpNeeded),
      last_contacted_at: new Date().toISOString(),
      call_insights: callInsights,
      last_call_summary: summary ?? null,
    };
    if (structured.spouse_name) customerPatch.spouse_name = structured.spouse_name;
    if (structured.household_type) customerPatch.household_type = structured.household_type;
    if (structured.employment_status) customerPatch.employment_status = structured.employment_status;
    if (structured.preferred_meeting_time) customerPatch.preferred_meeting_time = structured.preferred_meeting_time;
    if (followUpNeeded) customerPatch.follow_up_at = new Date().toISOString();

    await supabase.from("customers").update(customerPatch).eq("id", resolvedCustomerId);
  }

  if (campaignId && resolvedCustomerId) {
    await supabase
      .from("dial_campaign_customers")
      .update({ status: "completed" })
      .eq("campaign_id", campaignId)
      .eq("customer_id", resolvedCustomerId);

    await supabase
      .from("dial_campaigns")
      .update({ current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  return { ok: true as const, outcome, campaignId };
}

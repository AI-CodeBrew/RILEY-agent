import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import { parseCallInsights, type CallInsights } from "@/lib/call-notes";
import { openWindowIds, loadCampaignWindows, zonedDateString } from "@/lib/campaign-schedule";
import { LIVE_CALL_STATUSES, type Customer, type CustomerStatus, type SalesAgent } from "@/types/database";
import type { DialCampaign } from "@/types/database";

export type { CallInsights };

export function customerStatusForOutcome(
  outcome: string,
  followUpNeeded?: boolean
): CustomerStatus {
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

export function insightsFromStructured(data: Record<string, unknown> | null | undefined): CallInsights {
  return parseCallInsights(data);
}

/** Apply AI-extracted fields to the customer record after a call. */
export async function applyCallInsightsToCustomer(
  customerId: string,
  insights: CallInsights,
  summary?: string | null
) {
  const patch: Record<string, unknown> = {
    call_insights: insights,
    last_call_summary: summary ?? null,
  };
  if (insights.spouse_name) patch.spouse_name = insights.spouse_name;
  if (insights.household_type) patch.household_type = insights.household_type;
  if (insights.employment_status) patch.employment_status = insights.employment_status;
  if (insights.preferred_meeting_time) {
    patch.preferred_meeting_time = insights.preferred_meeting_time;
  }
  if (insights.follow_up_needed) {
    patch.follow_up_at = new Date().toISOString();
  }

  await supabaseAdmin.from("customers").update(patch as Partial<Customer>).eq("id", customerId);
}

async function agentHasLiveCall(agentId: string) {
  const { data } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("agent_id", agentId)
    .in("status", [...LIVE_CALL_STATUSES]);
  return (data?.length ?? 0) > 0;
}

/**
 * A priority customer the phone provider refuses to dial (Vapi rejects the
 * number — typically a missing/wrong country code) would otherwise sit at the
 * head of the queue and be retried every tick forever, blocking every lead
 * behind it. When the failure is about the number itself, drop them out of the
 * queue (they stay a normal customer, fixable from the Customers page) and
 * leave a note saying why. Transient failures (agent busy, billing block) are
 * left alone so those leads keep their place.
 */
async function demoteIfNumberRejected(customer: Customer, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const numberProblem = /Vapi API error 400|valid phone number|E\.164|isn't a valid phone number/i.test(message);
  if (!numberProblem) return;

  const note = "Auto-call skipped: the phone provider rejected this number (check the country code, e.g. +92 for Pakistan).";
  await supabaseAdmin
    .from("customers")
    .update({ priority: "normal", notes: customer.notes ? `${customer.notes}\n${note}` : note })
    .eq("id", customer.id);
}

/**
 * The agent's oldest not-yet-called high-priority customer — today that's
 * only Google Sheets leads (source='google_sheet'), created 'high' by
 * app/api/cron/process-sheet-leads. Status 'new' is what makes this a
 * queue: triggerCallForCustomer flips the customer to 'calling', so a lead
 * drops out of it the moment it's dialed, and its outcome then flows
 * through the normal status/retry system like any other customer.
 */
async function nextPriorityCustomer(agentId: string): Promise<Customer | null> {
  const { data } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("agent_id", agentId)
    .eq("priority", "high")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Customer | null) ?? null;
}

/**
 * Priority queue outside a running campaign: dials the next Google Sheets
 * lead if the agent is free and their own call gap has passed. Called every
 * tick from process-sheet-leads for agents with no *running* campaign — a
 * running one drains the same queue itself, ahead of its own members (see
 * advanceCampaign). Both paths go through triggerCallForCustomer, which
 * re-checks the agent isn't already on a call.
 */
export async function advancePriorityQueue(agentId: string): Promise<{
  action: "idle" | "dialed" | "error";
  message?: string;
  customerId?: string;
}> {
  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return { action: "error", message: "Agent not found" };

  if (await agentHasLiveCall(agentId)) return { action: "idle", message: "Agent on a live call" };

  const { data: lastEndedCall } = await supabaseAdmin
    .from("calls")
    .select("created_at")
    .eq("agent_id", agentId)
    .eq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastEndedCall?.created_at) {
    const elapsed = Date.now() - new Date(lastEndedCall.created_at).getTime();
    if (elapsed < (agent.call_gap_seconds ?? 0) * 1000) {
      return { action: "idle", message: "Waiting between calls" };
    }
  }

  const customer = await nextPriorityCustomer(agentId);
  if (!customer) return { action: "idle", message: "No priority customers waiting" };

  try {
    await triggerCallForCustomer({
      customer,
      agent: agent as SalesAgent,
      triggeredBy: agentId,
      voiceGender: agent.default_voice_gender,
    });
    return { action: "dialed", customerId: customer.id };
  } catch (err) {
    await demoteIfNumberRejected(customer, err);
    return { action: "error", message: err instanceof Error ? err.message : "Failed to dial" };
  }
}

async function loadCampaign(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("dial_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (error || !data) return null;
  return data as DialCampaign;
}

/** Dial the next pending customer if the campaign window is open and agent is idle. */
export async function advanceCampaign(campaignId: string): Promise<{
  action: "idle" | "waiting" | "completed" | "stopped" | "dialed" | "error";
  message?: string;
  customerId?: string;
}> {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return { action: "error", message: "Campaign not found" };

  if (campaign.status === "stopped" || campaign.status === "completed") {
    return { action: "stopped" };
  }

  if (campaign.status === "paused") {
    return { action: "idle", message: "Campaign paused" };
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", campaign.agent_id)
    .single();

  if (agentError || !agent) {
    return { action: "error", message: "Agent not found" };
  }

  // A campaign runs across its whole start_date..end_date range, waking up
  // for each of its own daily windows (see lib/campaign-schedule.ts) rather
  // than being a single one-shot instant — it only ever "completes" because
  // the range ended or the customer list ran out (below), never just
  // because today's window closed.
  //
  // The campaign's own browser-detected timezone (captured when it was
  // created — see 00000000000031_campaign_window_scoped_customers.sql) is
  // used here rather than the agent's account timezone setting, so "today"
  // and each window's time-of-day match the clock the agent actually picked
  // them against. Falls back to the account setting for campaigns created
  // before that column existed.
  const timezone = campaign.timezone ?? agent.timezone;
  const now = new Date();
  const today = zonedDateString(now, timezone);

  if (today > campaign.end_date) {
    await supabaseAdmin
      .from("dial_campaigns")
      .update({ status: "completed", current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { action: "completed", message: "Date range ended" };
  }

  if (today < campaign.start_date) {
    if (campaign.status !== "scheduled" && campaign.status !== "running") {
      await supabaseAdmin
        .from("dial_campaigns")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
    }
    return { action: "waiting", message: "Waiting for the date range to start" };
  }

  const windows = await loadCampaignWindows(campaignId);
  const openIds = openWindowIds(windows, now, timezone);
  if (openIds.length === 0) {
    if (campaign.status !== "scheduled" && campaign.status !== "running") {
      await supabaseAdmin
        .from("dial_campaigns")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
    }
    return { action: "waiting", message: "Outside today's calling windows" };
  }
  const callTypeByWindow = new Map(windows.map((w) => [w.id, w.call_type]));

  if (campaign.status === "scheduled" || campaign.status === "draft") {
    await supabaseAdmin
      .from("dial_campaigns")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  if (await agentHasLiveCall(campaign.agent_id)) {
    return { action: "idle", message: "Agent on a live call" };
  }

  const { data: lastEndedCall } = await supabaseAdmin
    .from("calls")
    .select("created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastEndedCall?.created_at) {
    const elapsed = Date.now() - new Date(lastEndedCall.created_at).getTime();
    if (elapsed < campaign.gap_seconds * 1000) {
      return { action: "idle", message: "Waiting between calls" };
    }
  }

  // Google Sheets leads (priority='high', status='new') jump ahead of this
  // campaign's own members. Same window/gap/agent-busy gates as everyone else
  // (all checked above); once the queue is empty this falls straight through
  // to the campaign's normal member selection below, unchanged. Passing this
  // campaign's id makes the call's follow-up retries clamp into its windows,
  // same as a member's would.
  const priorityCustomer = await nextPriorityCustomer(campaign.agent_id);
  if (priorityCustomer) {
    try {
      await triggerCallForCustomer({
        customer: priorityCustomer,
        agent: agent as SalesAgent,
        triggeredBy: campaign.agent_id,
        campaignId: campaign.id,
        voiceGender: campaign.voice_gender,
      });
      return { action: "dialed", customerId: priorityCustomer.id };
    } catch (err) {
      await demoteIfNumberRejected(priorityCustomer, err);
      return {
        action: "error",
        message: err instanceof Error ? err.message : "Failed to dial",
      };
    }
  }

  // Scoped to whichever window(s) are open right now (or, for rows created
  // before per-window scoping existed, window_id is null and they're always
  // eligible) — a pending customer whose own schedule hasn't opened yet is
  // left alone rather than dialed early.
  const { data: nextMemberRaw } = await supabaseAdmin
    .from("dial_campaign_customers")
    .select("id, customer_id, window_id, customer:customers(*)")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .or(`window_id.in.(${openIds.join(",")}),window_id.is.null`)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextMember = nextMemberRaw as {
    id: string;
    customer_id: string;
    window_id: string | null;
    customer: Customer | null;
  } | null;

  if (!nextMember?.customer) {
    // Nothing dialable in an open window right now — but the campaign only
    // actually "completes" once every schedule's list is empty, not just
    // the one(s) currently open. Also has to count "dialing" rows here, not
    // just "pending": resolveCallOutcome/reconcile-live-calls flips a call
    // to "ended" and only *then*, a few sequential DB writes later, flips
    // this member's own status back to "pending" for an immediate retry —
    // a tick landing in that gap would otherwise see zero "pending" rows for
    // a member that's actually still being finished up, mark the whole
    // campaign "completed" for good, and strand that customer's remaining
    // retry (dial_campaign_customers stuck "pending" under a dead campaign,
    // as seen in production: campaign "completed" with a member still
    // "pending" and retry_count short of retry_max_attempts).
    const { count } = await supabaseAdmin
      .from("dial_campaign_customers")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "dialing"]);

    if (!count) {
      await supabaseAdmin
        .from("dial_campaigns")
        .update({ status: "completed", current_customer_id: null, updated_at: new Date().toISOString() })
        .eq("id", campaignId);
      return { action: "completed", message: "All customers dialed" };
    }
    return { action: "waiting", message: "Remaining customers are in a schedule that isn't open yet" };
  }

  const customer = nextMember.customer as Customer;
  if (customer.status === "do_not_call") {
    await supabaseAdmin
      .from("dial_campaign_customers")
      .update({ status: "skipped" })
      .eq("id", nextMember.id);
    return advanceCampaign(campaignId);
  }

  await supabaseAdmin
    .from("dial_campaign_customers")
    .update({ status: "dialing" })
    .eq("id", nextMember.id);

  await supabaseAdmin
    .from("dial_campaigns")
    .update({
      current_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  try {
    await triggerCallForCustomer({
      customer,
      agent: agent as SalesAgent,
      triggeredBy: campaign.agent_id,
      campaignId: campaign.id,
      voiceGender: campaign.voice_gender,
      callTypeOverride: nextMember.window_id ? (callTypeByWindow.get(nextMember.window_id) ?? null) : null,
    });
    return { action: "dialed", customerId: customer.id };
  } catch (err) {
    await supabaseAdmin
      .from("dial_campaign_customers")
      .update({ status: "pending" })
      .eq("id", nextMember.id);
    await supabaseAdmin
      .from("dial_campaigns")
      .update({ current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return {
      action: "error",
      message: err instanceof Error ? err.message : "Failed to dial",
    };
  }
}

/** Mark campaign member done; next dial happens on the next tick. */
export async function completeCampaignCall({
  campaignId,
  customerId,
}: {
  campaignId: string;
  customerId: string;
}) {
  await supabaseAdmin
    .from("dial_campaign_customers")
    .update({ status: "completed" })
    .eq("campaign_id", campaignId)
    .eq("customer_id", customerId);

  await supabaseAdmin
    .from("dial_campaigns")
    .update({ current_customer_id: null, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
}

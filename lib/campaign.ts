import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import { parseCallInsights, type CallInsights } from "@/lib/call-notes";
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

  const now = Date.now();
  const windowStart = new Date(campaign.window_start).getTime();
  const windowEnd = new Date(campaign.window_end).getTime();

  if (now > windowEnd) {
    await supabaseAdmin
      .from("dial_campaigns")
      .update({ status: "completed", current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { action: "completed", message: "Calling window ended" };
  }

  if (now < windowStart) {
    if (campaign.status !== "scheduled" && campaign.status !== "running") {
      await supabaseAdmin
        .from("dial_campaigns")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
    }
    return { action: "waiting", message: "Waiting for window to start" };
  }

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

  const { data: nextMemberRaw } = await supabaseAdmin
    .from("dial_campaign_customers")
    .select("id, customer_id, customer:customers(*)")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextMember = nextMemberRaw as {
    id: string;
    customer_id: string;
    customer: Customer | null;
  } | null;

  if (!nextMember?.customer) {
    await supabaseAdmin
      .from("dial_campaigns")
      .update({ status: "completed", current_customer_id: null, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { action: "completed", message: "All customers dialed" };
  }

  const customer = nextMember.customer as Customer;
  if (customer.status === "do_not_call") {
    await supabaseAdmin
      .from("dial_campaign_customers")
      .update({ status: "skipped" })
      .eq("id", nextMember.id);
    return advanceCampaign(campaignId);
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", campaign.agent_id)
    .single();

  if (agentError || !agent) {
    return { action: "error", message: "Agent not found" };
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

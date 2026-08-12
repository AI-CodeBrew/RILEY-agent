import { supabaseAdmin } from "@/lib/supabase-admin";
import { toE164 } from "@/lib/format";
import { toCallStatus, triggerOutboundCall, type AssistantVoiceGender } from "@/lib/vapi";
import { resolveOutboundNumberForCall } from "@/lib/number-routing";
import { LIVE_CALL_STATUSES, type Customer, type SalesAgent } from "@/types/database";

export interface TriggerCallResult {
  call: Record<string, unknown>;
  vapi_call: Record<string, unknown>;
}

/**
 * Places an outbound Vapi call for a customer on behalf of an agent. Which
 * connected number it calls from is never a caller-supplied choice — it's
 * resolved here from the customer's area code via the agent's region
 * routing (see lib/number-routing.ts), so manual dials and auto-dial
 * campaigns always agree on the same number for the same customer.
 */
export async function triggerCallForCustomer({
  customer,
  agent,
  triggeredBy,
  scheduledFor,
  campaignId,
  voiceGender,
}: {
  customer: Customer;
  agent: SalesAgent;
  triggeredBy: string;
  scheduledFor?: string | null;
  campaignId?: string | null;
  /** Voice picked in the dial dialog, or null/undefined to use the assistant's default. */
  voiceGender?: AssistantVoiceGender | null;
}): Promise<TriggerCallResult> {
  if (customer.status === "do_not_call") {
    throw new Error(`${customer.name} is marked do-not-call.`);
  }

  const { data: liveCalls } = await supabaseAdmin
    .from("calls")
    .select("id, status")
    .eq("customer_id", customer.id)
    .in("status", [...LIVE_CALL_STATUSES]);

  if (liveCalls && liveCalls.length > 0) {
    throw new Error("There's already a call in progress or queued for this customer.");
  }

  const { data: agentLiveCalls } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("agent_id", agent.id)
    .in("status", [...LIVE_CALL_STATUSES]);

  if (agentLiveCalls && agentLiveCalls.length > 0) {
    throw new Error("Finish the current call before starting another.");
  }

  const customerPhone = toE164(customer.phone);
  if (!customerPhone) {
    throw new Error(
      `"${customer.phone}" isn't a valid phone number — use full international format, e.g. +923001234567 for Pakistan.`
    );
  }

  const resolvedNumber = await resolveOutboundNumberForCall(agent.id, customerPhone);
  if (!resolvedNumber.ok) {
    throw new Error(resolvedNumber.message);
  }

  const vapiCall = await triggerOutboundCall({
    customerName: customer.name,
    customerPhone,
    customerId: customer.id,
    agentId: agent.id,
    agentName: agent.name,
    agentNumber: resolvedNumber.number,
    customerEmail: customer.email,
    province: customer.province,
    customerTimezone: customer.timezone,
    agentTimezone: agent.timezone,
    kitCount: customer.kit_count,
    mailingAddress: customer.mailing_address,
    requestDate: customer.request_date,
    confirmationCode: customer.confirmation_code,
    dateOfBirth: customer.date_of_birth,
    beneficiaryName: customer.beneficiary_name,
    phoneNumberId: resolvedNumber.vapiPhoneNumberId,
    scheduledFor: scheduledFor ?? null,
    campaignId: campaignId ?? null,
    voiceGender: voiceGender ?? null,
  });

  const status = scheduledFor ? "scheduled" : toCallStatus(vapiCall.status);

  const { data: call, error: callInsertError } = await supabaseAdmin
    .from("calls")
    .insert({
      customer_id: customer.id,
      agent_id: agent.id,
      triggered_by: triggeredBy,
      vapi_call_id: vapiCall.id,
      control_url: vapiCall.monitor?.controlUrl ?? null,
      status,
      scheduled_for: scheduledFor ?? null,
      campaign_id: campaignId ?? null,
      phone_number_id: resolvedNumber.phoneNumberId,
    })
    .select("*")
    .single();

  if (callInsertError || !call) {
    throw new Error(callInsertError?.message ?? "Failed to record call");
  }

  await supabaseAdmin
    .from("customers")
    .update({
      status: scheduledFor ? "call_scheduled" : "calling",
      last_contacted_at: scheduledFor ? customer.last_contacted_at : new Date().toISOString(),
    })
    .eq("id", customer.id);

  return { call, vapi_call: vapiCall as Record<string, unknown> };
}

// Edge Function: vapi-webhook-handler
//
// Configured as the Vapi assistant's `server.url` (see vapi/assistant.json).
// Vapi posts several message types here over the life of a call; we only
// act on "end-of-call-report", which fires once with the final transcript.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";

type CallOutcome =
  | "appointment_set"
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "call_back_later"
  | "error";

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

function mapVapiStatus(status: string | undefined) {
  switch (status) {
    case "scheduled":
      return "scheduled";
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "forwarding":
      return "in_progress";
    case "ended":
      return "ended";
    default:
      return null;
  }
}

function customerStatusForOutcome(outcome: CallOutcome, followUpNeeded?: boolean) {
  if (followUpNeeded || outcome === "call_back_later") return "follow_up";
  switch (outcome) {
    case "appointment_set":
      return "appointment_set";
    case "not_interested":
      return "not_interested";
    case "no_answer":
    case "voicemail":
      return "no_answer";
    default:
      return "contacted";
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const message = body?.message ?? body;

    if (message?.type === "status-update") {
      const callId: string | undefined = message.call?.id;
      const status = mapVapiStatus(message.status);
      if (callId && status) {
        await getSupabaseAdmin()
          .from("calls")
          .update({ status })
          .eq("vapi_call_id", callId)
          .neq("status", "canceled");
      }
      return jsonResponse({ received: true });
    }

    if (message?.type !== "end-of-call-report") {
      return jsonResponse({ received: true });
    }

    const vapiCallId: string | undefined = message.call?.id;
    const metadata = message.call?.metadata ?? {};
    const customerId: string | undefined = metadata.customerId;
    const agentId: string | undefined = metadata.agentId;

    const transcript: string | undefined = message.transcript ?? message.artifact?.transcript;
    const recordingUrl: string | undefined =
      message.recordingUrl ??
      message.artifact?.recordingUrl ??
      message.artifact?.recording?.stereoUrl ??
      message.artifact?.recording?.mono?.combinedUrl;

    const structured = message.analysis?.structuredData ?? {};
    const structuredOutcome: CallOutcome | undefined = structured.outcome;
    const endedReason: string | undefined =
      message.endedReason ?? message.call?.endedReason ?? undefined;
    let outcome = structuredOutcome ?? outcomeFromEndedReason(endedReason);
    if (endedReason?.toLowerCase().includes("voicemail")) {
      outcome = "voicemail";
    }
    const followUpNeeded = structured.follow_up_needed === true;
    const summary: string | undefined = message.analysis?.summary ?? message.summary;

    const callInsights = {
      outcome,
      call_received:
        outcome === "voicemail" || outcome === "no_answer"
          ? false
          : (structured.call_received ?? null),
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
      key_notes: structured.key_notes ?? null,
    };

    const durationSeconds: number | null =
      message.durationSeconds ??
      (message.startedAt && message.endedAt
        ? Math.round(
            (new Date(message.endedAt).getTime() - new Date(message.startedAt).getTime()) / 1000
          )
        : null);
    const cost: number | null = message.cost ?? null;

    if (!vapiCallId && !customerId) {
      return jsonResponse({ error: "no vapi call id or customerId metadata on payload" }, 400);
    }

    const supabase = getSupabaseAdmin();

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
      return jsonResponse({ error: updateError.message }, 500);
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
      if (structured.preferred_meeting_time) {
        customerPatch.preferred_meeting_time = structured.preferred_meeting_time;
      }
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

    return jsonResponse({ received: true, outcome, campaign_id: campaignId });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});

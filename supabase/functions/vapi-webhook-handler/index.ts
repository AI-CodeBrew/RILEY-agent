// Edge Function: vapi-webhook-handler
//
// Configured as the Vapi assistant's `server.url` (see vapi/assistant.json).
// Vapi posts several message types here over the life of a call; we only
// act on "end-of-call-report", which fires once with the final transcript.
//
// Outcome is read from `analysis.structuredData.outcome`, which the
// assistant fills in per the schema in vapi/assistant.json
// (analysisPlan.structuredDataPlan). If that's missing (e.g. the call
// dropped before analysis ran), we fall back to a heuristic off
// `endedReason`.
//
// Matches the call by `vapi_call_id` (set when we triggered it from
// app/api/calls/trigger). Falls back to `metadata.customerId` /
// `metadata.agentId` — echoed back on every Vapi message because we passed
// them as `metadata` when creating the call — in case the initial insert
// raced with this webhook.

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
  if (reason.includes("voicemail")) return "voicemail";
  if (reason.includes("no-answer") || reason.includes("busy")) return "no_answer";
  if (reason.includes("error") || reason.includes("pipeline")) return "error";
  return "call_back_later";
}

/** Vapi's status vocabulary → the `calls.status` column. */
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

function customerStatusForOutcome(outcome: CallOutcome) {
  switch (outcome) {
    case "appointment_set":
      return "appointment_set";
    case "not_interested":
      return "not_interested";
    case "no_answer":
    case "voicemail":
      return "no_answer";
    case "call_back_later":
    case "error":
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

    // status-update fires as the call moves queued → ringing → in-progress,
    // which is what lets the portal show a live call and offer "hang up"
    // before the end-of-call report exists.
    if (message?.type === "status-update") {
      const callId: string | undefined = message.call?.id;
      const status = mapVapiStatus(message.status);
      if (callId && status) {
        await getSupabaseAdmin()
          .from("calls")
          .update({ status })
          .eq("vapi_call_id", callId)
          // A call canceled from the portal shouldn't be resurrected by a
          // late status-update still in flight.
          .neq("status", "canceled");
      }
      return jsonResponse({ received: true });
    }

    if (message?.type !== "end-of-call-report") {
      // Ack other event types (transcript, hang, etc.) so Vapi doesn't retry
      // them; we only persist on the final report.
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
    const structuredOutcome: CallOutcome | undefined =
      message.analysis?.structuredData?.outcome;
    const outcome = structuredOutcome ?? outcomeFromEndedReason(message.endedReason);
    const summary: string | undefined = message.analysis?.summary ?? message.summary;

    // durationSeconds is present on most reports; fall back to the timestamps
    // so the portal's talk-time totals aren't full of blanks.
    const durationSeconds: number | null =
      message.durationSeconds ??
      (message.startedAt && message.endedAt
        ? Math.round(
            (new Date(message.endedAt).getTime() -
              new Date(message.startedAt).getTime()) /
              1000
          )
        : null);
    const cost: number | null = message.cost ?? null;

    if (!vapiCallId && !customerId) {
      return jsonResponse(
        { error: "no vapi call id or customerId metadata on payload" },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    // Update the calls row created when we triggered the call. Match on
    // vapi_call_id first (the reliable key); fall back to the most recent
    // call for this customer if that insert hasn't landed yet.
    let updateQuery = supabase
      .from("calls")
      .update({
        transcript: transcript ?? null,
        recording_url: recordingUrl ?? null,
        outcome,
        status: "ended",
        ended_reason: message.endedReason ?? null,
        duration_seconds: durationSeconds,
        cost,
        summary: summary ?? null,
      })
      .select("id, customer_id, agent_id");

    updateQuery = vapiCallId
      ? updateQuery.eq("vapi_call_id", vapiCallId)
      : updateQuery.eq("customer_id", customerId!).is("outcome", null);

    const { data: updatedCalls, error: updateError } = await updateQuery;

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && updatedCalls?.[0]) {
      resolvedCustomerId = updatedCalls[0].customer_id;
    }

    if ((!updatedCalls || updatedCalls.length === 0) && resolvedCustomerId) {
      // We never saw the outbound leg (e.g. call placed outside this app).
      // Still record it so nothing is lost. customer_id is required, so
      // there's nothing useful to persist without one.
      await supabase.from("calls").insert({
        customer_id: resolvedCustomerId,
        agent_id: agentId ?? null,
        vapi_call_id: vapiCallId ?? null,
        transcript: transcript ?? null,
        recording_url: recordingUrl ?? null,
        outcome,
        status: "ended",
        ended_reason: message.endedReason ?? null,
        duration_seconds: durationSeconds,
        cost,
        summary: summary ?? null,
      });
    }

    if (resolvedCustomerId) {
      await supabase
        .from("customers")
        .update({
          status: customerStatusForOutcome(outcome),
          last_contacted_at: new Date().toISOString(),
        })
        .eq("id", resolvedCustomerId);
    }

    return jsonResponse({ received: true, outcome });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

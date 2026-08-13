// Edge Function: vapi-webhook-handler
//
// Configured as the Vapi assistant's `server.url` (see vapi/assistant.json).
// Vapi posts several message types here over the life of a call; we only
// act on "end-of-call-report", which fires once with the final transcript.
//
// This is the primary path for closing out a call, but it's a single
// webhook delivery — if it's ever rejected (secret drift) or lost, nothing
// here retries it. reconcile-live-calls polls Vapi directly on a schedule
// as a backstop, sharing the same terminal-state logic via
// _shared/resolve-call-outcome.ts so the two paths can't diverge.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { resolveCallOutcome, type VapiCallLike } from "../_shared/resolve-call-outcome.ts";

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

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    console.error(
      "vapi-webhook-handler: rejected request — x-vapi-secret missing or doesn't match VAPI_SERVER_SECRET. " +
        "Likely cause: the secret configured on the live Vapi assistant is out of sync with this function's " +
        "secret (re-run `npm run vapi:sync` and confirm `supabase secrets list` has the matching value)."
    );
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

      // This fires the moment Vapi tears the call down — well before the
      // slower end-of-call-report, which waits on post-call analysis and can
      // take anywhere from seconds to a couple minutes. Without this nudge
      // the customer sits on "calling" for that whole gap. resolveCallOutcome
      // (triggered by end-of-call-report, moments later) always overwrites
      // this with the real outcome, so it's only ever a placeholder — the
      // `.eq("status", "calling")` guard makes it a no-op if that's somehow
      // already landed first.
      if (status === "ended") {
        const customerId: string | undefined = message.call?.metadata?.customerId;
        if (customerId) {
          await getSupabaseAdmin()
            .from("customers")
            .update({ status: "contacted" })
            .eq("id", customerId)
            .eq("status", "calling");
        }
      }

      return jsonResponse({ received: true });
    }

    if (message?.type !== "end-of-call-report") {
      return jsonResponse({ received: true });
    }

    const call: VapiCallLike = {
      id: message.call?.id,
      endedReason: message.endedReason ?? message.call?.endedReason ?? undefined,
      startedAt: message.startedAt,
      endedAt: message.endedAt,
      cost: message.cost,
      durationSeconds: message.durationSeconds,
      transcript: message.transcript,
      recordingUrl: message.recordingUrl,
      summary: message.summary,
      analysis: message.analysis,
      artifact: message.artifact,
      metadata: message.call?.metadata ?? {},
    };

    if (!call.id && !call.metadata?.customerId) {
      return jsonResponse({ error: "no vapi call id or customerId metadata on payload" }, 400);
    }

    const result = await resolveCallOutcome(call);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 500);
    }

    return jsonResponse({ received: true, outcome: result.outcome, campaign_id: result.campaignId });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});

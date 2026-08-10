// Edge Function: reconcile-live-calls
//
// Backstop for vapi-webhook-handler. That function only fires once, on a
// single webhook delivery ("end-of-call-report") — if it's ever rejected
// (e.g. VAPI_SERVER_SECRET drift) or lost, a call's local `calls.status`
// (and `customers.status = "calling"`) is stuck forever, which permanently
// blocks the auto-dial campaign feature for that agent.
//
// This function is invoked on a schedule by pg_cron (see the migration
// that sets it up). It finds `calls` rows that have been sitting in a live
// status for implausibly long, asks Vapi directly what actually happened,
// and — if Vapi says the call is over — resolves it via the same shared
// logic the webhook uses, so the two paths can never disagree.
//
// It also catches a second, subtler case: Vapi's lightweight
// "status-update" webhook can independently set `calls.status = "ended"`
// (see vapi-webhook-handler's status-update branch) even when the separate
// "end-of-call-report" webhook — the one that fills in `ended_reason`,
// `transcript`, `duration_seconds`, and resets `customers.status` — is lost
// or fails. That leaves a call that *looks* terminal (status: "ended") but
// never actually went through resolveCallOutcome, so it's included here too:
// status "ended" with no `ended_reason`, past a short grace period for the
// real report to land. `outcome` alone isn't a safe signal for this — a
// live booking (book-appointment) stamps an early "appointment_set" outcome
// on the still-in-progress row the moment it succeeds, so a call can be
// fully unresolved (no transcript, no duration) while `outcome` is already
// non-null; `ended_reason` is only ever set by resolveCallOutcome itself.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { verifyCronSecret } from "../_shared/cron-auth.ts";
import { resolveCallOutcome, type VapiCallLike } from "../_shared/resolve-call-outcome.ts";

const VAPI_BASE_URL = "https://api.vapi.ai";

// A call still "ringing"/"queued"/"scheduled" this long after creation never
// actually connected. `in_progress` gets a much longer leash tied to the
// assistant's own hard cutoff (maxDurationSeconds in vapi/assistant.json,
// currently 1800s) plus a buffer for the end-of-call-report to land.
const PRE_CONNECT_STALE_MS = 10 * 60 * 1000;
const IN_PROGRESS_STALE_MS = 35 * 60 * 1000;
const ENDED_UNRESOLVED_STALE_MS = 15 * 60 * 1000;

interface StaleCallRow {
  id: string;
  vapi_call_id: string | null;
  customer_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  status: string;
  outcome: string | null;
  ended_reason: string | null;
  created_at: string;
}

async function fetchVapiCall(vapiCallId: string, apiKey: string) {
  const res = await fetch(`${VAPI_BASE_URL}/call/${vapiCallId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) return { notFound: true as const };
  if (!res.ok) {
    throw new Error(`Vapi API error ${res.status} on /call/${vapiCallId}: ${await res.text()}`);
  }
  return { notFound: false as const, data: (await res.json()) as Record<string, unknown> };
}

Deno.serve(async (req) => {
  if (!verifyCronSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("VAPI_API_KEY");
  if (!apiKey) {
    console.error("reconcile-live-calls: missing VAPI_API_KEY secret.");
    return jsonResponse({ error: "Missing VAPI_API_KEY" }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();

  // Two different flavors of "stuck": still showing a live status, or
  // showing "ended" without ever having gone through resolveCallOutcome (the
  // status-update webhook landed but end-of-call-report never did — see file
  // header). Detecting the second flavor on `outcome.is.null` alone misses
  // calls where book-appointment already stamped an early "appointment_set"
  // outcome on the still-live row the moment a booking succeeded — resolveCallOutcome
  // is the only thing that ever sets `ended_reason`, so its absence is what
  // actually means "never resolved," regardless of what outcome (if any) is
  // already sitting on the row. The shortest relevant threshold
  // (PRE_CONNECT_STALE_MS) is used as the DB-side filter; the per-row
  // threshold below narrows further.
  const { data: staleRows, error } = await supabase
    .from("calls")
    .select("id, vapi_call_id, customer_id, agent_id, campaign_id, status, outcome, ended_reason, created_at")
    .or("status.in.(scheduled,queued,ringing,in_progress),and(status.eq.ended,ended_reason.is.null)")
    .lt("created_at", new Date(now - PRE_CONNECT_STALE_MS).toISOString());

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const candidates = ((staleRows ?? []) as StaleCallRow[]).filter((row) => {
    const ageMs = now - new Date(row.created_at).getTime();
    const threshold =
      row.status === "in_progress"
        ? IN_PROGRESS_STALE_MS
        : row.status === "ended"
          ? ENDED_UNRESOLVED_STALE_MS
          : PRE_CONNECT_STALE_MS;
    return ageMs >= threshold;
  });

  const results: Array<{ callId: string; outcome?: string; skipped?: string; error?: string }> = [];

  for (const row of candidates) {
    if (!row.vapi_call_id) {
      // Nothing to reconcile against — flag it for a human rather than
      // guessing at a terminal state with no source of truth to check.
      console.error(`reconcile-live-calls: stale call ${row.id} has no vapi_call_id, skipping.`);
      results.push({ callId: row.id, skipped: "no vapi_call_id" });
      continue;
    }

    try {
      const vapiResult = await fetchVapiCall(row.vapi_call_id, apiKey);

      const stillLive =
        !vapiResult.notFound &&
        ["scheduled", "queued", "ringing", "in-progress", "forwarding"].includes(
          String(vapiResult.data.status ?? "")
        );
      if (stillLive) {
        results.push({ callId: row.id, skipped: "still live per Vapi" });
        continue;
      }

      const call: VapiCallLike = vapiResult.notFound
        ? {
            id: row.vapi_call_id,
            endedReason: "reconciled-not-found-in-vapi",
            metadata: { customerId: row.customer_id, agentId: row.agent_id ?? undefined, campaignId: row.campaign_id },
          }
        : {
            id: row.vapi_call_id,
            endedReason: (vapiResult.data.endedReason as string | undefined) ?? "reconciled",
            startedAt: vapiResult.data.startedAt as string | undefined,
            endedAt: vapiResult.data.endedAt as string | undefined,
            cost: vapiResult.data.cost as number | undefined,
            transcript: vapiResult.data.transcript as string | undefined,
            recordingUrl: vapiResult.data.recordingUrl as string | undefined,
            summary: vapiResult.data.summary as string | undefined,
            analysis: vapiResult.data.analysis as VapiCallLike["analysis"],
            artifact: vapiResult.data.artifact as VapiCallLike["artifact"],
            // Trust our own row over whatever Vapi echoes back — it's the
            // reason we're able to resolve this call at all.
            metadata: { customerId: row.customer_id, agentId: row.agent_id ?? undefined, campaignId: row.campaign_id },
          };

      const resolved = await resolveCallOutcome(call);
      if (!resolved.ok) {
        results.push({ callId: row.id, error: resolved.error });
        continue;
      }
      results.push({ callId: row.id, outcome: resolved.outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`reconcile-live-calls: failed to reconcile call ${row.id}:`, message);
      results.push({ callId: row.id, error: message });
    }
  }

  return jsonResponse({ checked: candidates.length, results });
});

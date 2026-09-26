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
//
// It also enforces each agent's configured ring timeout: Vapi has no native
// ring-duration/timeout parameter on its call API (confirmed against Vapi's
// own docs and community guidance — this has to be enforced by the calling
// application), and this app's own Twilio usage (lib/twilio.ts) is
// provisioning-only, so there's no lower-level Twilio control to reach for
// either. `ringing` AND `queued` rows get their own, much shorter threshold
// (agent.ring_timeout_seconds, 12-13s) instead of PRE_CONNECT_STALE_MS.
// `queued` is included here — not just `ringing` — because live testing
// (2026-09-16) confirmed Vapi never sends a "ringing" status-update at all
// for this account's outbound BYO-Twilio calls: status-update goes straight
// from `queued` to `ended`, so a `ringing`-only check silently never fires
// and the call runs to Vapi/Twilio's own natural no-answer timeout (~55s
// observed) instead of being cut early. `scheduled` deliberately keeps the
// long PRE_CONNECT_STALE_MS threshold — that status means Vapi is holding
// the call for a future `earliestAt`, not dialing yet.
// This function is scheduled every 4 seconds
// (00000000000042_tighten_reconcile_cron.sql) rather than every 7 minutes so
// that threshold is actually meaningful. This remains a close approximation,
// not an exact cutoff — real enforcement lands somewhere in
// [ring_timeout_seconds, +~4s] once poll cadence and the Vapi hangup
// round-trip are accounted for, in the same spirit as ring duration already
// varying by carrier in the real world. The 4-second cadence keeps the
// options (9s/10s/15s) resolving on separate poll ticks in most cases,
// though 9s and 10s are close enough to sometimes land on the same tick —
// harmless, they're just processed together that tick.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { verifyCronSecret } from "../_shared/cron-auth.ts";
import { resolveCallOutcome, type VapiCallLike } from "../_shared/resolve-call-outcome.ts";

const VAPI_BASE_URL = "https://api.vapi.ai";

// A call still "queued"/"scheduled" this long after creation never actually
// connected. `in_progress` gets a much longer leash tied to the assistant's
// own hard cutoff (maxDurationSeconds in vapi/assistant.json, currently
// 1800s) plus a buffer for the end-of-call-report to land. `ringing` uses
// each agent's own ring_timeout_seconds instead (see RING_TIMEOUT_FLOOR_MS).
const PRE_CONNECT_STALE_MS = 10 * 60 * 1000;
const IN_PROGRESS_STALE_MS = 35 * 60 * 1000;
const ENDED_UNRESOLVED_STALE_MS = 15 * 60 * 1000;
// Lower bound of sales_agents.ring_timeout_seconds (12/13) — used only to
// narrow the initial DB query; the per-row filter below applies each
// row's actual agent.ring_timeout_seconds. Must stay <= the lowest allowed
// ring_timeout_seconds value, or rows younger than this floor never even
// enter the candidate set and a short timeout silently never fires.
const RING_TIMEOUT_FLOOR_MS = 12 * 1000;

/**
 * Extra leash for `queued` rows before treating them like "ringing past
 * timeout". BYO-Twilio outbound on this account often never emits Vapi
 * `ringing` — status stays `queued` while Twilio is still setting up the
 * international PSTN leg. Without this grace, reconcile cancels the dial
 * before the customer's phone ever rings.
 *
 * Kept short (8s): the Next.js ring-timeout worker is the exact cut; this
 * is only a production backstop. A 15s grace let CA voicemail answer
 * (~21–26s from dial create) before reconcile ever fired.
 */
const DIAL_SETUP_GRACE_MS = 8 * 1000;

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
  control_url: string | null;
  agent: {
    ring_timeout_seconds: number;
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
  } | null;
}

async function fetchVapiCall(vapiCallId: string, apiKey: string) {
  const res = await fetch(`${VAPI_BASE_URL}/call/${vapiCallId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // 404 means Vapi never heard of this call id; 400 here means Vapi *did*,
  // but it's aged out of the account's call-history retention window (seen
  // in practice as "Your subscription plan only covers the last N days of
  // call history"). Both are permanent, not transient — treating only 404
  // as unfetchable left every out-of-window row erroring forever on each
  // poll tick, permanently occupying the non-ringing batch slots
  // (NON_RINGING_BATCH_LIMIT below) instead of ever getting resolved off it.
  if (res.status === 404 || res.status === 400) return { notFound: true as const };
  if (!res.ok) {
    throw new Error(`Vapi API error ${res.status} on /call/${vapiCallId}: ${await res.text()}`);
  }
  return { notFound: false as const, data: (await res.json()) as Record<string, unknown> };
}

/** Hangs up a still-ringing call at Vapi — mirrors lib/vapi.ts's
 * cancelVapiCall for the ringing/in-progress case (this file can't import
 * from lib/, Deno edge functions run in a separate runtime — see
 * resolve-call-outcome.ts's own duplicated helpers for the same pattern).
 * Returns whether Vapi actually confirmed the hangup — the caller must not
 * call resolveCallOutcome unless this is true. This does a real GET
 * afterward rather than trusting the DELETE/control-url response status:
 * observed live and repeatable on 2026-09-16, Vapi returned 200 on the
 * DELETE for a call still in its early `queued` dial-setup window, but the
 * call kept ringing for another ~45s regardless — Vapi accepted the cancel
 * without actually acting on it. Trusting a 200 alone let the caller mark
 * the row resolved in our DB ("handled at 10s") while the customer's phone
 * was still ringing at 55s. */
async function endRingingCall(
  {
    vapiCallId,
    controlUrl,
    twilioAccountSid,
    twilioAuthToken,
  }: {
    vapiCallId: string;
    controlUrl: string | null;
    twilioAccountSid?: string | null;
    twilioAuthToken?: string | null;
  },
  apiKey: string
): Promise<boolean> {
  let commandAccepted = false;
  if (controlUrl) {
    try {
      // A call still in `queued` (dialing hasn't reached Vapi's live-call
      // handling yet — no "ringing" status-update is ever sent for this
      // account's calls, see the file header) leaves this control URL not
      // yet backed by anything listening, and a plain fetch can hang on it
      // for tens of seconds with no response — observed live on 2026-09-16
      // eating the whole ring_timeout_seconds budget before ever reaching
      // the DELETE fallback below. A short deadline forces that fallback
      // quickly instead of stalling this entire poll tick on one dead call.
      const res = await fetch(controlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "end-call" }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) commandAccepted = true;
    } catch {
      // Control URL can be stale/unreachable/slow — fall through to DELETE.
    }
  }
  if (!commandAccepted) {
    try {
      const res = await fetch(`${VAPI_BASE_URL}/call/${vapiCallId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        commandAccepted = true;
      } else {
        console.error(
          `reconcile-live-calls: DELETE /call/${vapiCallId} returned ${res.status}: ${await res.text()}`
        );
      }
    } catch (err) {
      console.error(`reconcile-live-calls: failed to end ringing call ${vapiCallId}:`, err);
    }
  }

  // Vapi DELETE often returns 200 while the PSTN leg keeps ringing. Hang up
  // the Twilio CallSid when we have credentials — that is what actually
  // stops the fax-machine pickup after ~16s of ringing.
  try {
    const check = await fetchVapiCall(vapiCallId, apiKey);
    if (!check.notFound) {
      const data = check.data;
      const callSid =
        (typeof data.phoneCallProviderId === "string" && data.phoneCallProviderId.startsWith("CA")
          ? data.phoneCallProviderId
          : null) ??
        (typeof data.twilioCallSid === "string" && data.twilioCallSid.startsWith("CA")
          ? data.twilioCallSid
          : null) ??
        (typeof (data.transport as { callSid?: string } | undefined)?.callSid === "string"
          ? (data.transport as { callSid: string }).callSid
          : null);

      if (callSid && twilioAccountSid && twilioAuthToken) {
        const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        const hangup = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls/${callSid}.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Status: "completed" }),
            signal: AbortSignal.timeout(5000),
          }
        );
        if (hangup.ok || hangup.status === 404) {
          commandAccepted = true;
        } else {
          console.error(
            `reconcile-live-calls: Twilio hangup ${callSid} returned ${hangup.status}: ${await hangup.text()}`
          );
        }
      }
    }
  } catch (err) {
    console.error(`reconcile-live-calls: Twilio hangup path failed for ${vapiCallId}:`, err);
  }

  if (!commandAccepted) return false;

  try {
    const check = await fetchVapiCall(vapiCallId, apiKey);
    if (check.notFound) return true;
    return check.data.status === "ended";
  } catch (err) {
    // Couldn't verify — treat as unconfirmed rather than assume success.
    console.error(`reconcile-live-calls: post-hangup verification failed for ${vapiCallId}:`, err);
    return false;
  }
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
  // (RING_TIMEOUT_FLOOR_MS) is used as the DB-side filter; the per-row
  // threshold below narrows further.
  const { data: staleRows, error } = await supabase
    .from("calls")
    .select(
      "id, vapi_call_id, customer_id, agent_id, campaign_id, status, outcome, ended_reason, created_at, control_url, agent:sales_agents!agent_id(ring_timeout_seconds, twilio_account_sid, twilio_auth_token)"
    )
    .or("status.in.(scheduled,queued,ringing,in_progress),and(status.eq.ended,ended_reason.is.null)")
    .lt("created_at", new Date(now - RING_TIMEOUT_FLOOR_MS).toISOString());

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  // `queued` is treated the same as `ringing` here: confirmed live (see the
  // incident notes below this block) that Vapi never actually emits a
  // "ringing" status-update for this account's outbound BYO-Twilio calls —
  // status-update goes straight from `queued` to `ended`. `scheduled` is
  // deliberately excluded — that status means Vapi is holding the call
  // until `earliestAt` (see triggerOutboundCall), not dialing yet, so it
  // must keep the long PRE_CONNECT_STALE_MS leash instead of getting cut at
  // ring_timeout_seconds.
  const allCandidates = ((staleRows ?? []) as unknown as StaleCallRow[]).filter((row) => {
    const ageMs = now - new Date(row.created_at).getTime();
    const configuredSec = row.agent?.ring_timeout_seconds ?? 13;
    const ringBudgetMs =
      ([12, 13].includes(configuredSec) ? configuredSec : 13) * 1000;
    const threshold =
      row.status === "ringing"
        ? ringBudgetMs
        : row.status === "queued"
          ? // Queued may still be dial setup (esp. international) — don't cut
            // at the bare ring budget or the handset never rings.
            ringBudgetMs + DIAL_SETUP_GRACE_MS
          : row.status === "in_progress"
            ? IN_PROGRESS_STALE_MS
            : row.status === "ended"
              ? ENDED_UNRESOLVED_STALE_MS
              : PRE_CONNECT_STALE_MS;
    return ageMs >= threshold;
  });

  // `ringing`/`queued` rows are time-critical (this is the only thing
  // enforcing ring_timeout_seconds) and are always processed in full.
  // Everything else is a backstop for a rare failure and can tolerate being
  // drained a batch at a time. Without this split, a large backlog of
  // unresolved `ended` rows (e.g. from an outage in this function itself)
  // gets fully re-walked on every 4-second tick — that starves the ringing
  // hangups behind it in the same invocation, and enough overlapping ticks
  // hammering Vapi's API at once trips Vapi's own rate limit (429), which
  // then blocks *new* outbound calls too. Bounding the backstop batch keeps
  // each invocation fast and lets the backlog drain over several ticks
  // instead of every tick.
  const NON_RINGING_BATCH_LIMIT = 10;
  const ringingCandidates = allCandidates.filter(
    (row) => row.status === "ringing" || row.status === "queued"
  );
  const otherCandidates = allCandidates.filter(
    (row) => row.status !== "ringing" && row.status !== "queued"
  );
  const candidates = [...ringingCandidates, ...otherCandidates.slice(0, NON_RINGING_BATCH_LIMIT)];

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
      if (row.status === "ringing" || row.status === "queued") {
        // Past this agent's configured ring timeout — hang up ourselves
        // rather than asking Vapi first, since Vapi will genuinely still
        // report it as "ringing"/"queued" (there's no native timeout for it
        // to have already applied). resolveCallOutcome is idempotent, so a
        // race with a webhook that resolved this a moment ago is harmless.
        const hungUp = await endRingingCall(
          {
            vapiCallId: row.vapi_call_id,
            controlUrl: row.control_url,
            twilioAccountSid: row.agent?.twilio_account_sid,
            twilioAuthToken: row.agent?.twilio_auth_token,
          },
          apiKey
        );
        if (!hungUp) {
          // Don't mark this resolved in our DB unless Vapi actually
          // confirmed the hangup — otherwise our record says "handled" while
          // the real phone keeps ringing (see endRingingCall's doc comment).
          // The row stays a candidate and this retries on the next tick.
          results.push({ callId: row.id, skipped: "hangup not confirmed, retrying next tick" });
          continue;
        }
        const resolved = await resolveCallOutcome({
          id: row.vapi_call_id,
          endedReason: "customer-did-not-answer",
          metadata: { customerId: row.customer_id, agentId: row.agent_id ?? undefined, campaignId: row.campaign_id },
        });
        if (!resolved.ok) {
          results.push({ callId: row.id, error: resolved.error });
        } else {
          results.push({ callId: row.id, outcome: resolved.outcome });
        }
        continue;
      }

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

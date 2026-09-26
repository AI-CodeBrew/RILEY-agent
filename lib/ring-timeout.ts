import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { forceEndOutboundCall } from "@/lib/force-end-call";
import { getTwilioCallStatus } from "@/lib/twilio";
import { getVapiCall } from "@/lib/vapi";
import { LIVE_CALL_STATUSES } from "@/types/database";

/**
 * International dial setup can sit in Twilio `queued` for a while before the
 * handset actually rings. Don't start the ring budget until then.
 */
const MAX_WAIT_FOR_RING_MS = 25_000;

/** Allowed sales_agents.ring_timeout_seconds values (see migration 059). */
const RING_TIMEOUT_ALLOWED = new Set([12, 13]);
const RING_TIMEOUT_DEFAULT_SEC = 13;
const RING_TIMEOUT_MAX_SEC = 13;

/**
 * Hangup + Twilio propagation can take a couple seconds after we fire.
 * Fire early so a 13s setting is dead by ~13s (before ~16s fax / CA VM).
 */
const HANGUP_HEADROOM_MS = 3000;

function resolveRingTimeoutSeconds(seconds: number): number {
  if (RING_TIMEOUT_ALLOWED.has(seconds)) return seconds;
  return RING_TIMEOUT_DEFAULT_SEC;
}

export type DialTimelineEvent = {
  at: string;
  dialSec: number;
  ringSec: number | null;
  vapi: string;
  twilio: string;
  message: string;
};

export type RingTimeoutCutParams = {
  callId: string;
  vapiCallId: string;
  controlUrl?: string | null;
  agentId: string;
  ringTimeoutSeconds: number;
};

function extractTwilioCallSid(call: unknown): string | null {
  if (!call || typeof call !== "object") return null;
  const c = call as {
    phoneCallProviderId?: unknown;
    twilioCallSid?: unknown;
    transport?: { callSid?: unknown };
  };
  if (typeof c.phoneCallProviderId === "string" && c.phoneCallProviderId.startsWith("CA")) {
    return c.phoneCallProviderId;
  }
  if (typeof c.twilioCallSid === "string" && c.twilioCallSid.startsWith("CA")) {
    return c.twilioCallSid;
  }
  if (typeof c.transport?.callSid === "string" && c.transport.callSid.startsWith("CA")) {
    return c.transport.callSid;
  }
  return null;
}

function formatDialLogLine(event: DialTimelineEvent): string {
  const ring =
    event.ringSec != null ? ` ring+${event.ringSec.toFixed(1)}s` : "";
  return `  [dial+${event.dialSec.toFixed(1)}s] Vapi=${event.vapi} Twilio=${event.twilio}${ring} — ${event.message}`;
}

/** Persist timeline without blocking the hangup path. */
function logDialTimeline(callId: string, event: DialTimelineEvent) {
  console.log(`ring-timeout call=${callId}${formatDialLogLine(event)}`);
  void persistDialTimeline(callId, event).catch((err) => {
    console.error(
      `ring-timeout: timeline persist failed for ${callId}:`,
      err instanceof Error ? err.message : err
    );
  });
}

async function persistDialTimeline(callId: string, event: DialTimelineEvent) {
  const { data: row } = await supabaseAdmin
    .from("calls")
    .select("call_insights")
    .eq("id", callId)
    .maybeSingle();

  const insights =
    row?.call_insights && typeof row.call_insights === "object"
      ? ({ ...(row.call_insights as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const prev = Array.isArray(insights.dial_timeline)
    ? (insights.dial_timeline as DialTimelineEvent[])
    : [];

  await supabaseAdmin
    .from("calls")
    .update({ call_insights: { ...insights, dial_timeline: [...prev, event].slice(-80) } })
    .eq("id", callId);
}

async function cutIfStillRinging({
  callId,
  vapiCallId,
  controlUrl,
  agentId,
  twilioCallSid,
}: {
  callId: string;
  vapiCallId: string;
  controlUrl?: string | null;
  agentId: string;
  twilioCallSid?: string | null;
}): Promise<{ cut: boolean; usedTwilio: boolean; answered: boolean }> {
  const { data: call } = await supabaseAdmin
    .from("calls")
    .select("id, status, customer_id, campaign_id, control_url, ended_reason")
    .eq("id", callId)
    .maybeSingle();

  if (!call) return { cut: true, usedTwilio: false, answered: false };
  if (call.ended_reason) return { cut: true, usedTwilio: false, answered: false };
  if (!LIVE_CALL_STATUSES.some((status) => status === call.status)) {
    return { cut: true, usedTwilio: false, answered: false };
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("twilio_account_sid, twilio_auth_token")
    .eq("id", agentId)
    .maybeSingle();

  // Twilio is source of truth — if PSTN already answered, do not hang up.
  if (
    twilioCallSid &&
    agent?.twilio_account_sid &&
    agent?.twilio_auth_token
  ) {
    const tw = await getTwilioCallStatus(
      agent.twilio_account_sid,
      agent.twilio_auth_token,
      twilioCallSid
    );
    if (tw?.status === "in-progress") {
      return { cut: false, usedTwilio: false, answered: true };
    }
    if (
      tw?.status === "completed" ||
      tw?.status === "busy" ||
      tw?.status === "failed" ||
      tw?.status === "no-answer" ||
      tw?.status === "canceled"
    ) {
      return { cut: true, usedTwilio: true, answered: false };
    }
  }

  const result = await forceEndOutboundCall({
    vapiCallId,
    controlUrl: controlUrl ?? call.control_url,
    twilioAccountSid: agent?.twilio_account_sid,
    twilioAuthToken: agent?.twilio_auth_token,
    twilioCallSid,
  });

  if (!result.ended) {
    console.error(
      `ring-timeout: call ${callId} still ${result.status} after cut (twilio=${result.usedTwilio})`
    );
    return {
      cut: false,
      usedTwilio: result.usedTwilio,
      answered: result.status === "in-progress" || result.status === "forwarding",
    };
  }

  if (!call.ended_reason) {
    await supabaseAdmin
      .from("calls")
      .update({
        status: "ended",
        ended_reason: "customer-did-not-answer",
        outcome: "no_answer",
      })
      .eq("id", callId)
      .in("status", [...LIVE_CALL_STATUSES]);

    await supabaseAdmin
      .from("customers")
      .update({ status: "follow_up", last_contacted_at: new Date().toISOString() })
      .eq("id", call.customer_id)
      .eq("status", "calling");

    if (call.campaign_id) {
      await supabaseAdmin
        .from("dial_campaign_customers")
        .update({ status: "completed" })
        .eq("campaign_id", call.campaign_id)
        .eq("customer_id", call.customer_id)
        .eq("status", "dialing");

      await supabaseAdmin
        .from("dial_campaigns")
        .update({ current_customer_id: null, updated_at: new Date().toISOString() })
        .eq("id", call.campaign_id);
    }
  }

  return { cut: true, usedTwilio: result.usedTwilio, answered: false };
}

type Phase = "ringing" | "answered" | "ended" | "timeout";

type RingWaitResult = { phase: Phase; callSid: string | null };

/**
 * Twilio-first ring detection.
 *
 * Vapi is only used to discover the Twilio CallSid. Ring / answered / ended
 * decisions come from Twilio call status — Vapi "ringing"/"in-progress" is
 * ignored here because it is late/unreliable on BYO Twilio and caused CA
 * voicemail cuts to miss the 13s window.
 */
async function waitUntilPhoneRingingOrDone({
  callId,
  vapiCallId,
  twilioAccountSid,
  twilioAuthToken,
  dialStartedAt,
}: {
  callId: string;
  vapiCallId: string;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
  dialStartedAt: number;
}): Promise<RingWaitResult> {
  const deadline = Date.now() + MAX_WAIT_FOR_RING_MS;
  let callSid: string | null = null;
  let lastKey = "";

  if (!twilioAccountSid || !twilioAuthToken) {
    logDialTimeline(callId, {
      at: new Date().toISOString(),
      dialSec: (Date.now() - dialStartedAt) / 1000,
      ringSec: null,
      vapi: "—",
      twilio: "—",
      message: "no Twilio creds — cannot Twilio-first ring-cut",
    });
    return { phase: "timeout", callSid: null };
  }

  while (Date.now() < deadline) {
    // Vapi: CallSid discovery only (not ring/answer decisions).
    if (!callSid) {
      try {
        const vapi = await getVapiCall(vapiCallId);
        callSid = extractTwilioCallSid(vapi) ?? callSid;
        if (vapi.status === "ended" && !callSid) {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: null,
            vapi: vapi.status,
            twilio: "—",
            message: `ended before CallSid (${vapi.endedReason ?? "no reason"})`,
          });
          return { phase: "ended", callSid };
        }
      } catch {
        // Keep polling for CallSid.
      }
    }

    let twilioStatus = "—";
    if (callSid) {
      const tw = await getTwilioCallStatus(twilioAccountSid, twilioAuthToken, callSid);
      if (tw) {
        twilioStatus = String(tw.status);
        if (tw.status === "in-progress") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: null,
            vapi: "—",
            twilio: twilioStatus,
            message: "answered on Twilio — skipping ring cut",
          });
          return { phase: "answered", callSid };
        }
        if (
          tw.status === "completed" ||
          tw.status === "busy" ||
          tw.status === "failed" ||
          tw.status === "no-answer" ||
          tw.status === "canceled"
        ) {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: null,
            vapi: "—",
            twilio: twilioStatus,
            message: `Twilio terminal: ${tw.status}`,
          });
          return { phase: "ended", callSid };
        }
        if (tw.status === "ringing") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: 0,
            vapi: "—",
            twilio: twilioStatus,
            message: "RINGING (Twilio) — ring budget started",
          });
          return { phase: "ringing", callSid };
        }
      }
    }

    const key = `${twilioStatus}|${callSid ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      logDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: null,
        vapi: "—",
        twilio: twilioStatus,
        message: callSid
          ? `waiting for Twilio ringing (sid=${callSid.slice(0, 10)}…)`
          : "waiting for CallSid from Vapi transport",
      });
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  return { phase: "timeout", callSid };
}

/**
 * Hard ring budget driven by Twilio status only.
 * Deadline always wins — slow HTTP must not push hangup past the fax window.
 */
async function waitRingBudgetOrAnswered({
  callSid,
  twilioAccountSid,
  twilioAuthToken,
  budgetMs,
}: {
  callSid: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  budgetMs: number;
}): Promise<"timeout" | "answered" | "ended"> {
  const deadline = Date.now() + budgetMs;
  let result: "timeout" | "answered" | "ended" = "timeout";

  const poll = async () => {
    while (Date.now() < deadline) {
      const tw = await getTwilioCallStatus(twilioAccountSid, twilioAuthToken, callSid);
      if (tw?.status === "in-progress") {
        result = "answered";
        return;
      }
      if (
        tw?.status === "completed" ||
        tw?.status === "busy" ||
        tw?.status === "failed" ||
        tw?.status === "no-answer" ||
        tw?.status === "canceled"
      ) {
        result = "ended";
        return;
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(250, remaining)));
    }
  };

  await Promise.race([
    poll(),
    new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
  ]);

  return result;
}

/**
 * Runs the full ring-timeout cut. Safe to call from the dedicated production
 * worker route (own maxDuration) or inline as a local/dev fallback.
 */
export async function runRingTimeoutCut({
  callId,
  vapiCallId,
  controlUrl,
  agentId,
  ringTimeoutSeconds,
}: RingTimeoutCutParams): Promise<void> {
  const effectiveSeconds = resolveRingTimeoutSeconds(ringTimeoutSeconds);
  const deadlineMs = Math.min(effectiveSeconds, RING_TIMEOUT_MAX_SEC) * 1000;
  const ringThenCutMs = Math.max(1000, deadlineMs - HANGUP_HEADROOM_MS);
  const dialStartedAt = Date.now();

  try {
    logDialTimeline(callId, {
      at: new Date().toISOString(),
      dialSec: 0,
      ringSec: null,
      vapi: "queued",
      twilio: "—",
      message: `dial started — hangup at ring+${(ringThenCutMs / 1000).toFixed(1)}s (dead by ~${effectiveSeconds}s; fax ~16s)`,
    });

    const { data: agent } = await supabaseAdmin
      .from("sales_agents")
      .select("twilio_account_sid, twilio_auth_token")
      .eq("id", agentId)
      .maybeSingle();

    const { phase, callSid: detectedCallSid } = await waitUntilPhoneRingingOrDone({
      callId,
      vapiCallId,
      twilioAccountSid: agent?.twilio_account_sid,
      twilioAuthToken: agent?.twilio_auth_token,
      dialStartedAt,
    });

    if (phase === "ended" || phase === "answered") return;

    let ringingAt: number | null = null;
    let callSid = detectedCallSid;

    if (phase === "ringing") {
      ringingAt = Date.now();
      if (
        callSid &&
        agent?.twilio_account_sid &&
        agent?.twilio_auth_token
      ) {
        const budgetResult = await waitRingBudgetOrAnswered({
          callSid,
          twilioAccountSid: agent.twilio_account_sid,
          twilioAuthToken: agent.twilio_auth_token,
          budgetMs: ringThenCutMs,
        });
        if (budgetResult === "answered" || budgetResult === "ended") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: (Date.now() - ringingAt) / 1000,
            vapi: "—",
            twilio: budgetResult === "answered" ? "in-progress" : "ended",
            message:
              budgetResult === "answered"
                ? "answered on Twilio during ring budget — not cutting"
                : "Twilio ended during ring budget",
          });
          return;
        }
      }
    } else {
      logDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: null,
        vapi: "—",
        twilio: "—",
        message: `no Twilio ringing within ${MAX_WAIT_FOR_RING_MS / 1000}s — cutting stuck dial`,
      });
    }

    // Refresh CallSid once if we somehow don't have it yet — bounded, then hangup.
    if (!callSid) {
      try {
        const vapi = await getVapiCall(vapiCallId);
        callSid = extractTwilioCallSid(vapi);
      } catch {
        // Hangup path will retry briefly.
      }
    }

    const ringSecAtCut =
      ringingAt != null ? (Date.now() - ringingAt) / 1000 : null;

    logDialTimeline(callId, {
      at: new Date().toISOString(),
      dialSec: (Date.now() - dialStartedAt) / 1000,
      ringSec: ringSecAtCut,
      vapi: "—",
      twilio: "—",
      message: `Twilio hangup now (ring-timeout)${callSid ? ` sid=${callSid.slice(0, 10)}…` : " no-sid"}`,
    });

    // CallSid hangup FIRST — logging must not run ahead of the Twilio POST.
    let usedTwilio = false;
    let cut = false;
    let answered = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: live } = await supabaseAdmin
        .from("calls")
        .select("status, ended_reason")
        .eq("id", callId)
        .maybeSingle();

      if (!live || live.ended_reason) {
        cut = true;
        break;
      }
      if (!LIVE_CALL_STATUSES.some((status) => status === live.status)) {
        cut = true;
        break;
      }

      const result = await cutIfStillRinging({
        callId,
        vapiCallId,
        controlUrl,
        agentId,
        twilioCallSid: callSid,
      });
      usedTwilio = usedTwilio || result.usedTwilio;
      if (result.answered) {
        answered = true;
        break;
      }
      if (result.cut) {
        cut = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    logDialTimeline(callId, {
      at: new Date().toISOString(),
      dialSec: (Date.now() - dialStartedAt) / 1000,
      ringSec:
        ringingAt != null ? (Date.now() - ringingAt) / 1000 : ringSecAtCut,
      vapi: cut ? "ended" : answered ? "answered" : "—",
      twilio: usedTwilio ? "canceled" : "—",
      message: answered
        ? "answered before cut — not forcing hangup"
        : cut && usedTwilio
          ? "cut confirmed (CallSid hangup first)"
          : cut
            ? "cut marked (no Twilio confirm)"
            : "Twilio hangup attempted (ring-timeout)",
    });
  } catch (err) {
    console.error(
      `ring-timeout: failed for call ${callId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Absolute origin for the production ring-timeout worker. */
function ringTimeoutWorkerBaseUrl(): string | null {
  const explicit =
    process.env.RING_TIMEOUT_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    null;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

/** Shared secret for the internal worker (no new env required in prod). */
export function ringTimeoutWorkerSecret(): string | null {
  return (
    process.env.RING_TIMEOUT_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    null
  );
}

/**
 * Schedule the hard ring-timeout cut for a just-placed outbound call.
 *
 * Production: fan out to `/api/calls/ring-timeout` (own maxDuration=60) so the
 * hangup survives after the trigger request finishes. Local/dev without an
 * absolute URL: run the cut inline via `after()` / void.
 */
export function scheduleRingTimeoutCut(params: RingTimeoutCutParams) {
  const dispatch = async () => {
    const base = ringTimeoutWorkerBaseUrl();
    const secret = ringTimeoutWorkerSecret();

    if (base && secret) {
      try {
        const res = await fetch(`${base}/api/calls/ring-timeout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
          // Worker may run ~40s; keep this connection alive so the platform
          // does not cancel the sibling invocation mid-flight.
          signal: AbortSignal.timeout(55_000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `ring-timeout: worker HTTP ${res.status} for ${params.callId}: ${body}`
          );
          await runRingTimeoutCut(params);
        }
        return;
      } catch (err) {
        console.error(
          `ring-timeout: worker dispatch failed for ${params.callId}, running inline:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    await runRingTimeoutCut(params);
  };

  try {
    after(dispatch);
  } catch {
    void dispatch();
  }
}

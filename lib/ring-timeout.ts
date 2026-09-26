import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { forceEndOutboundCall } from "@/lib/force-end-call";
import { getTwilioCallStatus } from "@/lib/twilio";
import { getVapiCall } from "@/lib/vapi";
import { LIVE_CALL_STATUSES } from "@/types/database";

const PRE_ANSWER_STATUSES = new Set(["scheduled", "queued", "ringing"]);

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
 * Hangup + Twilio/Vapi propagation usually takes ~2–3s after we fire.
 * Subtract so a 13s setting is actually dead by ~13–14s (before ~16s fax).
 */
const HANGUP_HEADROOM_MS = 2000;

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
}: {
  callId: string;
  vapiCallId: string;
  controlUrl?: string | null;
  agentId: string;
}): Promise<boolean> {
  const { data: call } = await supabaseAdmin
    .from("calls")
    .select("id, status, customer_id, campaign_id, control_url, ended_reason")
    .eq("id", callId)
    .maybeSingle();

  if (!call) return true;
  if (!LIVE_CALL_STATUSES.some((status) => status === call.status)) return true;
  if (!PRE_ANSWER_STATUSES.has(call.status)) return true;

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("twilio_account_sid, twilio_auth_token")
    .eq("id", agentId)
    .maybeSingle();

  const result = await forceEndOutboundCall({
    vapiCallId,
    controlUrl: controlUrl ?? call.control_url,
    twilioAccountSid: agent?.twilio_account_sid,
    twilioAuthToken: agent?.twilio_auth_token,
  });

  if (!result.ended) {
    console.error(
      `ring-timeout: call ${callId} still ${result.status} after cut (twilio=${result.usedTwilio})`
    );
    return false;
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

  return true;
}

type Phase = "ringing" | "answered" | "ended" | "timeout";

/**
 * Poll until the phone is ringing (or answered/ended).
 *
 * Critical: treat Vapi `ringing` as ring-start even when Twilio status fetch
 * fails — previously a null Twilio response left us stuck in queued while the
 * handset was already ringing, starting the 11s budget ~9s late.
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
}): Promise<Phase> {
  const deadline = Date.now() + MAX_WAIT_FOR_RING_MS;
  let callSid: string | null = null;
  let lastKey = "";

  while (Date.now() < deadline) {
    let vapiStatus = "—";
    let twilioStatus = "—";

    try {
      const vapi = await getVapiCall(vapiCallId);
      vapiStatus = vapi.status ?? "—";
      callSid = extractTwilioCallSid(vapi) ?? callSid;

      if (vapi.status === "ended") {
        logDialTimeline(callId, {
          at: new Date().toISOString(),
          dialSec: (Date.now() - dialStartedAt) / 1000,
          ringSec: null,
          vapi: vapiStatus,
          twilio: twilioStatus,
          message: `ended (${vapi.endedReason ?? "no reason"})`,
        });
        return "ended";
      }
      if (vapi.status === "in-progress" || vapi.status === "forwarding") {
        logDialTimeline(callId, {
          at: new Date().toISOString(),
          dialSec: (Date.now() - dialStartedAt) / 1000,
          ringSec: null,
          vapi: vapiStatus,
          twilio: twilioStatus,
          message: "answered — skipping ring cut",
        });
        return "answered";
      }
    } catch {
      // Keep polling.
    }

    if (callSid && twilioAccountSid && twilioAuthToken) {
      const tw = await getTwilioCallStatus(twilioAccountSid, twilioAuthToken, callSid);
      if (tw) {
        twilioStatus = String(tw.status);
        if (tw.status === "in-progress") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: null,
            vapi: vapiStatus,
            twilio: twilioStatus,
            message: "answered on Twilio — skipping ring cut",
          });
          return "answered";
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
            vapi: vapiStatus,
            twilio: twilioStatus,
            message: `Twilio terminal: ${tw.status}`,
          });
          return "ended";
        }
        if (tw.status === "ringing") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: 0,
            vapi: vapiStatus,
            twilio: twilioStatus,
            message: "RINGING — ring budget started",
          });
          return "ringing";
        }
      }
    }

    // Vapi ringing alone is enough — don't wait for a Twilio GET that may fail.
    if (vapiStatus === "ringing") {
      logDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: 0,
        vapi: vapiStatus,
        twilio: twilioStatus,
        message: "RINGING (Vapi) — ring budget started",
      });
      return "ringing";
    }

    const key = `${vapiStatus}|${twilioStatus}|${callSid ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      logDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: null,
        vapi: vapiStatus,
        twilio: twilioStatus,
        message: callSid
          ? `waiting for ring (sid=${callSid.slice(0, 10)}…)`
          : "waiting for CallSid",
      });
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  return "timeout";
}

/**
 * Hard sleep for the ring budget. Only does lightweight answered/ended
 * checks — never awaits DB timeline writes (those delayed hangup past 11s).
 */
async function waitRingBudgetOrAnswered({
  vapiCallId,
  budgetMs,
}: {
  vapiCallId: string;
  budgetMs: number;
}): Promise<"timeout" | "answered" | "ended"> {
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    try {
      const vapi = await getVapiCall(vapiCallId);
      if (vapi.status === "ended") return "ended";
      if (vapi.status === "in-progress" || vapi.status === "forwarding") {
        return "answered";
      }
    } catch {
      // Keep waiting — hangup still fires at deadline.
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(400, remaining)));
  }

  return "timeout";
}

/**
 * Hard ring-timeout cut for a just-placed outbound call.
 *
 * Clock starts when ringing is detected (Twilio or Vapi). Hangup fires on a
 * hard timer (~11s for a 13s setting) — timeline DB writes are fire-and-forget
 * so they cannot push the CallSid hangup past the fax window.
 */
export function scheduleRingTimeoutCut({
  callId,
  vapiCallId,
  controlUrl,
  agentId,
  ringTimeoutSeconds,
}: {
  callId: string;
  vapiCallId: string;
  controlUrl?: string | null;
  agentId: string;
  ringTimeoutSeconds: number;
}) {
  const effectiveSeconds = resolveRingTimeoutSeconds(ringTimeoutSeconds);
  const deadlineMs = Math.min(effectiveSeconds, RING_TIMEOUT_MAX_SEC) * 1000;
  const ringThenCutMs = Math.max(1000, deadlineMs - HANGUP_HEADROOM_MS);
  const dialStartedAt = Date.now();

  const task = async () => {
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

      const phase = await waitUntilPhoneRingingOrDone({
        callId,
        vapiCallId,
        twilioAccountSid: agent?.twilio_account_sid,
        twilioAuthToken: agent?.twilio_auth_token,
        dialStartedAt,
      });

      if (phase === "ended" || phase === "answered") return;

      let ringingAt: number | null = null;

      if (phase === "ringing") {
        ringingAt = Date.now();
        const budgetResult = await waitRingBudgetOrAnswered({
          vapiCallId,
          budgetMs: ringThenCutMs,
        });
        if (budgetResult === "answered" || budgetResult === "ended") {
          logDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: (Date.now() - ringingAt) / 1000,
            vapi: budgetResult,
            twilio: "—",
            message:
              budgetResult === "answered"
                ? "answered during ring budget — not cutting"
                : "ended during ring budget",
          });
          return;
        }
      } else {
        logDialTimeline(callId, {
          at: new Date().toISOString(),
          dialSec: (Date.now() - dialStartedAt) / 1000,
          ringSec: null,
          vapi: "—",
          twilio: "—",
          message: `no ringing within ${MAX_WAIT_FOR_RING_MS / 1000}s — cutting stuck dial`,
        });
      }

      const ringSecAtCut =
        ringingAt != null ? (Date.now() - ringingAt) / 1000 : null;

      // CallSid hangup FIRST — logging must not run ahead of the Twilio POST.
      let hungUp = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: live } = await supabaseAdmin
          .from("calls")
          .select("status, ended_reason")
          .eq("id", callId)
          .maybeSingle();

        if (!live || live.ended_reason) {
          hungUp = true;
          break;
        }
        if (!LIVE_CALL_STATUSES.some((status) => status === live.status)) {
          hungUp = true;
          break;
        }
        if (!PRE_ANSWER_STATUSES.has(live.status)) {
          hungUp = true;
          break;
        }

        const ok = await cutIfStillRinging({ callId, vapiCallId, controlUrl, agentId });
        if (ok) {
          hungUp = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      logDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec:
          ringingAt != null ? (Date.now() - ringingAt) / 1000 : ringSecAtCut,
        vapi: hungUp ? "ended" : "—",
        twilio: hungUp ? "canceled" : "—",
        message: hungUp
          ? "cut confirmed (CallSid hangup first)"
          : "Twilio hangup attempted (ring-timeout)",
      });
    } catch (err) {
      console.error(
        `ring-timeout: failed for call ${callId}:`,
        err instanceof Error ? err.message : err
      );
    }
  };

  try {
    after(task);
  } catch {
    void task();
  }
}

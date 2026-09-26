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

function resolveRingTimeoutSeconds(seconds: number): number {
  if (RING_TIMEOUT_ALLOWED.has(seconds)) return seconds;
  // Legacy 9/10 (or anything else) → 13 so we don't cut too early vs ~16s fax.
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

async function appendDialTimeline(callId: string, event: DialTimelineEvent) {
  console.log(`ring-timeout call=${callId}${formatDialLogLine(event)}`);

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

  // Cap so a stuck poll can't blow the jsonb row.
  const dial_timeline = [...prev, event].slice(-80);

  await supabaseAdmin
    .from("calls")
    .update({ call_insights: { ...insights, dial_timeline } })
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

/**
 * BYO-Twilio outbound often never flips Vapi's status to `ringing` (stays
 * `queued` until answer/end). Use the Twilio CallSid status instead — that's
 * when the customer's phone is actually ringing.
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
}): Promise<"ringing" | "answered" | "ended" | "timeout"> {
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
        await appendDialTimeline(callId, {
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
        await appendDialTimeline(callId, {
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
        if (tw.status === "ringing" || vapiStatus === "ringing") {
          await appendDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: 0,
            vapi: vapiStatus,
            twilio: twilioStatus,
            message: "RINGING — ring budget started",
          });
          return "ringing";
        }
        if (tw.status === "in-progress") {
          await appendDialTimeline(callId, {
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
          await appendDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec: null,
            vapi: vapiStatus,
            twilio: twilioStatus,
            message: `Twilio terminal: ${tw.status}`,
          });
          return "ended";
        }
      }
    } else if (vapiStatus === "ringing") {
      await appendDialTimeline(callId, {
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
      await appendDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: null,
        vapi: vapiStatus,
        twilio: twilioStatus,
        message: callSid ? `waiting for ring (sid=${callSid.slice(0, 10)}…)` : "waiting for CallSid",
      });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return "timeout";
}

/**
 * Hard ring-timeout cut for a just-placed outbound call.
 *
 * Clock starts when Twilio reports the phone is ringing (not when Vapi
 * accepts the dial — BYO Twilio often stays `queued` on Vapi the whole time).
 * After ring_timeout_seconds (12 or 13), hangs up via Twilio so the call is
 * dead ~2–3s before typical fax pickup (~16s).
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
  const ringThenCutMs = Math.min(effectiveSeconds, RING_TIMEOUT_MAX_SEC) * 1000;
  const dialStartedAt = Date.now();

  const task = async () => {
    try {
      await appendDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: 0,
        ringSec: null,
        vapi: "queued",
        twilio: "—",
        message: `dial started — hangup at ring+${effectiveSeconds}s (dead ~2–3s before ~16s fax)`,
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

      // `ringing` → wait the ring budget. `timeout` (never saw Twilio ringing
      // after 25s) → cut; don't leave a stuck dial burning charge.
      if (phase === "ringing") {
        ringingAt = Date.now();
        const ringDeadline = ringingAt + ringThenCutMs;
        let lastRingLogSec = -1;

        while (Date.now() < ringDeadline) {
          const ringSec = (Date.now() - ringingAt) / 1000;
          const floor = Math.floor(ringSec);
          if (floor !== lastRingLogSec) {
            lastRingLogSec = floor;
            let vapiStatus = "—";
            let twilioStatus = "—";
            try {
              const vapi = await getVapiCall(vapiCallId);
              vapiStatus = vapi.status ?? "—";
              if (vapi.status === "ended") {
                await appendDialTimeline(callId, {
                  at: new Date().toISOString(),
                  dialSec: (Date.now() - dialStartedAt) / 1000,
                  ringSec,
                  vapi: vapiStatus,
                  twilio: twilioStatus,
                  message: `ended during ring (${vapi.endedReason ?? "—"})`,
                });
                return;
              }
              if (vapi.status === "in-progress" || vapi.status === "forwarding") {
                await appendDialTimeline(callId, {
                  at: new Date().toISOString(),
                  dialSec: (Date.now() - dialStartedAt) / 1000,
                  ringSec,
                  vapi: vapiStatus,
                  twilio: twilioStatus,
                  message: "answered during ring budget — not cutting",
                });
                return;
              }
              const sid = extractTwilioCallSid(vapi);
              if (sid && agent?.twilio_account_sid && agent?.twilio_auth_token) {
                const tw = await getTwilioCallStatus(
                  agent.twilio_account_sid,
                  agent.twilio_auth_token,
                  sid
                );
                twilioStatus = tw?.status ?? "—";
                if (tw?.status === "in-progress") {
                  await appendDialTimeline(callId, {
                    at: new Date().toISOString(),
                    dialSec: (Date.now() - dialStartedAt) / 1000,
                    ringSec,
                    vapi: vapiStatus,
                    twilio: twilioStatus,
                    message: "answered on Twilio — not cutting",
                  });
                  return;
                }
              }
            } catch {
              // Keep waiting.
            }

            await appendDialTimeline(callId, {
              at: new Date().toISOString(),
              dialSec: (Date.now() - dialStartedAt) / 1000,
              ringSec,
              vapi: vapiStatus,
              twilio: twilioStatus,
              message: "still ringing",
            });
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      } else {
        await appendDialTimeline(callId, {
          at: new Date().toISOString(),
          dialSec: (Date.now() - dialStartedAt) / 1000,
          ringSec: null,
          vapi: "—",
          twilio: "—",
          message: `no Twilio ringing within ${MAX_WAIT_FOR_RING_MS / 1000}s — cutting stuck dial`,
        });
      }

      const ringSecAtCut =
        ringingAt != null ? (Date.now() - ringingAt) / 1000 : null;
      await appendDialTimeline(callId, {
        at: new Date().toISOString(),
        dialSec: (Date.now() - dialStartedAt) / 1000,
        ringSec: ringSecAtCut,
        vapi: "—",
        twilio: "—",
        message: "Twilio hangup now (ring-timeout)",
      });

      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: live } = await supabaseAdmin
          .from("calls")
          .select("status, ended_reason")
          .eq("id", callId)
          .maybeSingle();

        if (!live || live.ended_reason) return;
        if (!LIVE_CALL_STATUSES.some((status) => status === live.status)) return;
        if (!PRE_ANSWER_STATUSES.has(live.status)) return;

        const ok = await cutIfStillRinging({ callId, vapiCallId, controlUrl, agentId });
        if (ok) {
          await appendDialTimeline(callId, {
            at: new Date().toISOString(),
            dialSec: (Date.now() - dialStartedAt) / 1000,
            ringSec:
              ringingAt != null ? (Date.now() - ringingAt) / 1000 : null,
            vapi: "ended",
            twilio: "canceled",
            message: "cut confirmed",
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
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

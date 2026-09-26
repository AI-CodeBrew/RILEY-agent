import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTwilioCallStatus } from "@/lib/twilio";
import { decryptToken } from "@/lib/token-crypto";
import { getVapiCall, toCallStatusStrict } from "@/lib/vapi";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { CALL_OUTCOMES, LIVE_CALL_STATUSES, type Call } from "@/types/database";
import type { DialTimelineEvent } from "@/lib/ring-timeout";

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

/**
 * Reads a call, syncing its live state from Vapi first.
 *
 * The end-of-call webhook is the source of truth for transcript/outcome, but
 * it only fires once the call is over — this is what lets the portal show
 * "ringing → in progress" while it's happening, and it's what the live call
 * panel polls.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Call>("calls", id, auth.session);
  if ("error" in authorized) return authorized.error;
  let call = authorized.row;

  const isLive = LIVE_CALL_STATUSES.some((status) => status === call.status);

  let dial: {
    vapiStatus: string | null;
    twilioStatus: string | null;
    callSid: string | null;
    dialElapsedSec: number;
    ringElapsedSec: number | null;
    phase: string;
    timeline: DialTimelineEvent[];
  } | null = null;

  const insights =
    call.call_insights && typeof call.call_insights === "object"
      ? (call.call_insights as Record<string, unknown>)
      : {};
  const timeline = Array.isArray(insights.dial_timeline)
    ? (insights.dial_timeline as DialTimelineEvent[])
    : [];

  if (isLive && call.vapi_call_id) {
    try {
      const vapiCall = await getVapiCall(call.vapi_call_id);
      // Unrecognized Vapi status → leave the current status alone rather
      // than guessing; only ended_reason/etc. below still get refreshed.
      const status = toCallStatusStrict(vapiCall.status) ?? call.status;
      const durationSeconds =
        vapiCall.startedAt && vapiCall.endedAt
          ? Math.round(
              (new Date(vapiCall.endedAt).getTime() -
                new Date(vapiCall.startedAt).getTime()) /
                1000
            )
          : null;

      if (status !== call.status || vapiCall.endedReason) {
        const { data: updated } = await supabaseAdmin
          .from("calls")
          .update({
            status,
            ended_reason: vapiCall.endedReason ?? call.ended_reason,
            duration_seconds: durationSeconds ?? call.duration_seconds,
            cost: vapiCall.cost ?? call.cost,
            // A control URL is only handed out once; keep the first one.
            control_url: call.control_url ?? vapiCall.monitor?.controlUrl ?? null,
          })
          .eq("id", id)
          .select("*")
          .single();

        if (updated) call = updated;
      }

      const callSid = extractTwilioCallSid(vapiCall);
      let twilioStatus: string | null = null;
      if (callSid && call.agent_id) {
        const { data: agent } = await supabaseAdmin
          .from("sales_agents")
          .select("twilio_account_sid, twilio_auth_token")
          .eq("id", call.agent_id)
          .maybeSingle();
        if (agent?.twilio_account_sid && agent?.twilio_auth_token) {
          const authToken = await decryptToken(agent.twilio_auth_token);
          if (authToken) {
            const tw = await getTwilioCallStatus(
              agent.twilio_account_sid,
              authToken,
              callSid
            );
            twilioStatus = tw?.status ?? null;
          }
        }
      }

      const dialElapsedSec =
        (Date.now() - new Date(call.created_at).getTime()) / 1000;
      const ringingEvent = timeline.find((e) => e.ringSec === 0);

      let phase = "queued";
      if (twilioStatus === "ringing" || vapiCall.status === "ringing") phase = "ringing";
      else if (
        twilioStatus === "in-progress" ||
        vapiCall.status === "in-progress" ||
        vapiCall.status === "forwarding"
      ) {
        phase = "in_progress";
      } else if (vapiCall.status === "ended") phase = "ended";

      dial = {
        vapiStatus: vapiCall.status ?? null,
        twilioStatus,
        callSid,
        dialElapsedSec: Number(dialElapsedSec.toFixed(1)),
        ringElapsedSec:
          ringingEvent != null
            ? Number(
                ((Date.now() - new Date(ringingEvent.at).getTime()) / 1000).toFixed(1)
              )
            : null,
        phase,
        timeline,
      };
    } catch (err) {
      // Vapi being briefly unreachable shouldn't 500 a status poll.
      console.error(`Failed to sync call ${id} from Vapi:`, err);
      dial = {
        vapiStatus: null,
        twilioStatus: null,
        callSid: null,
        dialElapsedSec: Number(
          ((Date.now() - new Date(call.created_at).getTime()) / 1000).toFixed(1)
        ),
        ringElapsedSec: null,
        phase: call.status,
        timeline,
      };
    }
  } else if (timeline.length > 0) {
    dial = {
      vapiStatus: call.status,
      twilioStatus: null,
      callSid: null,
      dialElapsedSec: call.duration_seconds ?? 0,
      ringElapsedSec: null,
      phase: call.status,
      timeline,
    };
  }

  return NextResponse.json({ call, dial });
}

/**
 * Lets an agent manually correct a call's outcome from the portal — e.g. the
 * AI classified it as `not_interested` but the customer actually bought on
 * the call, so it should read `sold`. Only touches `outcome`; the call's
 * live `status`/transcript/etc. stay whatever the webhook/reconcile jobs set.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Call>("calls", id, auth.session);
  if ("error" in authorized) return authorized.error;

  const body = await request.json().catch(() => ({}));
  if (!CALL_OUTCOMES.includes(body.outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of ${CALL_OUTCOMES.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("calls")
    .update({ outcome: body.outcome })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ call: data });
}

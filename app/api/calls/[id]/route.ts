import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getVapiCall, toCallStatusStrict } from "@/lib/vapi";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { CALL_OUTCOMES, LIVE_CALL_STATUSES, type Call } from "@/types/database";

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
    } catch (err) {
      // Vapi being briefly unreachable shouldn't 500 a status poll.
      console.error(`Failed to sync call ${id} from Vapi:`, err);
    }
  }

  return NextResponse.json({ call });
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

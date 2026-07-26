import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cancelVapiCall } from "@/lib/vapi";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { LIVE_CALL_STATUSES, type Call } from "@/types/database";

/**
 * Hangs up a live call, or drops a scheduled/queued one before it dials.
 * Either way the row lands on `canceled` so the customer isn't left stuck in
 * "calling" and the same customer can be redialled.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Call>("calls", id, auth.session);
  if ("error" in authorized) return authorized.error;
  const call = authorized.row;

  if (!LIVE_CALL_STATUSES.some((status) => status === call.status)) {
    return NextResponse.json(
      { error: `This call is already ${call.status.replaceAll("_", " ")}.` },
      { status: 409 }
    );
  }

  if (!call.vapi_call_id) {
    // Never made it to Vapi — nothing to hang up, just close the row out.
    await supabaseAdmin
      .from("calls")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  try {
    await cancelVapiCall({
      callId: call.vapi_call_id,
      controlUrl: call.control_url,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Vapi wouldn't end the call: ${err.message}`
            : "Failed to end the call",
      },
      { status: 502 }
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("calls")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      ended_reason: "canceled-from-portal",
      outcome: call.outcome ?? "call_back_later",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Leave the customer somewhere sensible: a canceled call isn't an answer.
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("status")
    .eq("id", call.customer_id)
    .single();

  if (customer?.status === "calling" || customer?.status === "call_scheduled") {
    await supabaseAdmin
      .from("customers")
      .update({ status: "contacted" })
      .eq("id", call.customer_id);
  }

  return NextResponse.json({ call: updated });
}

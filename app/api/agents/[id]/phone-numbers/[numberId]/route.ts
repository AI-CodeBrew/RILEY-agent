import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { releaseTwilioNumber } from "@/lib/twilio";
import { releaseVapiPhoneNumber } from "@/lib/vapi";
import { requireApiSession } from "@/lib/auth";

/** Disconnects one specific number — the agent's other connected numbers are untouched. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; numberId: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id, numberId } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only release a number on your own account" },
      { status: 403 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not configured" },
      { status: 500 }
    );
  }

  const { data: number, error: numberError } = await supabaseAdmin
    .from("agent_phone_numbers")
    .select("id, phone_number, twilio_phone_number_sid, vapi_phone_number_id")
    .eq("id", numberId)
    .eq("agent_id", id)
    .maybeSingle();

  if (numberError || !number) {
    return NextResponse.json({ error: "number not found" }, { status: 404 });
  }

  await releaseVapiPhoneNumber(number.vapi_phone_number_id);
  await releaseTwilioNumber(accountSid, authToken, number.twilio_phone_number_sid);

  const { error } = await supabaseAdmin
    .from("agent_phone_numbers")
    .delete()
    .eq("id", numberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phoneNumber: number.phone_number });
}

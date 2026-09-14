import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptToken } from "@/lib/token-crypto";
import { releaseTwilioNumber } from "@/lib/twilio";
import { releaseVapiPhoneNumber } from "@/lib/vapi";
import { requireApiSession } from "@/lib/auth";
import { AGENT_PHONE_NUMBER_COUNT_TAG } from "@/lib/agent-phone-count";

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

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("twilio_account_sid, twilio_auth_token")
    .eq("id", id)
    .single();

  if (agentError || !agent?.twilio_account_sid || !agent.twilio_auth_token) {
    return NextResponse.json(
      { error: "Connect your Twilio account in Settings before managing numbers." },
      { status: 400 }
    );
  }

  const accountSid = agent.twilio_account_sid;
  const authToken = await decryptToken(agent.twilio_auth_token);
  if (!authToken) {
    return NextResponse.json(
      { error: "Could not read your saved Twilio credentials — reconnect Twilio in Settings." },
      { status: 400 }
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

  // { expire: 0 } for immediate invalidation (read-your-own-writes) — this is
  // a Route Handler, so the Server-Action-only updateTag() isn't available.
  revalidateTag(AGENT_PHONE_NUMBER_COUNT_TAG, { expire: 0 });

  return NextResponse.json({ ok: true, phoneNumber: number.phone_number });
}

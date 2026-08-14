import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyTwilioAccount } from "@/lib/twilio";
import { requireApiSession } from "@/lib/auth";

/** Connects this agent's own Twilio account — validated against Twilio before saving. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only connect your own Twilio account" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accountSid = typeof body.account_sid === "string" ? body.account_sid.trim() : "";
  const authToken = typeof body.auth_token === "string" ? body.auth_token.trim() : "";

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Account SID and Auth Token are both required" },
      { status: 400 }
    );
  }

  let account;
  try {
    account = await verifyTwilioAccount(accountSid, authToken);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not verify this Twilio account" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update({
      twilio_account_sid: account.sid,
      twilio_auth_token: authToken,
      twilio_account_name: account.friendlyName,
      twilio_connected_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("twilio_account_sid, twilio_account_name, twilio_connected_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ twilio: data });
}

/** Disconnects this agent's own Twilio account. Doesn't touch the shared business account used for number provisioning. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only disconnect your own Twilio account" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin
    .from("sales_agents")
    .update({
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_account_name: null,
      twilio_connected_at: null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Disconnects this agent's Google Sheets lead-import. Sheet/column mapping are kept so Reconnect skips straight back to "connected". */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only disconnect your own Google account" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin
    .from("google_sheet_connections")
    .update({
      google_refresh_token: null,
      google_account_email: null,
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

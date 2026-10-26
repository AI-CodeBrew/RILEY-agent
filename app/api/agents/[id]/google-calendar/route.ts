import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { decryptToken } from "@/lib/token-crypto";

/**
 * Disconnects this agent's Google Calendar. If it was their booking
 * calendar, that choice is cleared too, so Riley falls back to weekly hours
 * or Calendly instead of failing on every call.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only disconnect your own Google Calendar" },
      { status: 403 }
    );
  }

  const { data: connection } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("google_refresh_token")
    .eq("agent_id", id)
    .maybeSingle();

  // Best-effort revoke, so the app also disappears from the agent's Google
  // account permissions — disconnecting still succeeds if Google refuses.
  if (connection?.google_refresh_token) {
    try {
      const token = await decryptToken(connection.google_refresh_token);
      if (token) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      }
    } catch (err) {
      console.warn("google calendar revoke failed:", err);
    }
  }

  const { error } = await supabaseAdmin
    .from("google_calendar_connections")
    .delete()
    .eq("agent_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (auth.session.agent.calendar_provider === "google") {
    await supabaseAdmin.from("sales_agents").update({ calendar_provider: null }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}

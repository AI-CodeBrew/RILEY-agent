import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Disconnects this agent's own Zoom account. If it was their active video provider, that preference is cleared too. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only disconnect your own Zoom account" },
      { status: 403 }
    );
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("video_provider")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("sales_agents")
    .update({
      zoom_access_token: null,
      zoom_refresh_token: null,
      zoom_token_expires_at: null,
      zoom_account_email: null,
      zoom_connected_at: null,
      video_provider: agent?.video_provider === "zoom" ? null : agent?.video_provider,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Deletes a single reply — the author, or an admin moderating. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: reply } = await supabaseAdmin
    .from("forum_replies")
    .select("agent_id")
    .eq("id", id)
    .maybeSingle();

  if (!reply) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!auth.session.isAdmin && reply.agent_id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only delete your own replies" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin.from("forum_replies").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

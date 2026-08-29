import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Deletes a topic (and its replies, via cascade) — the author, or an admin moderating. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: topic } = await supabaseAdmin
    .from("forum_topics")
    .select("agent_id")
    .eq("id", id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!auth.session.isAdmin && topic.agent_id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only delete your own topics" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin.from("forum_topics").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

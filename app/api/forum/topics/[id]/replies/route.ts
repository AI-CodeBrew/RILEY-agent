import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Posts a reply on a topic. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const { data: topic } = await supabaseAdmin
    .from("forum_topics")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("forum_replies")
    .insert({ topic_id: id, agent_id: auth.session.agent.id, body: text })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reply: data });
}

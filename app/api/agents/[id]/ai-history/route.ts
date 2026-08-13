import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/**
 * Clears AI Integration change history — either specific rows (`ids`) or
 * everything for this agent (`{}` / omitted body). Self-only, like the
 * voice/script prefs themselves.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { ids } = body ?? {};

  let query = supabaseAdmin.from("agent_ai_preference_changes").delete().eq("agent_id", id);

  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string") || ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
    }
    query = query.in("id", ids);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

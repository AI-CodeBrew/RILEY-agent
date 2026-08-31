import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

const REBUTTAL_COLUMNS =
  "id, script, objection_text, answer_text, status, times_matched, source_call_id, created_at, approved_at";

// Agent-only, on purpose — this page never shows anything to admin. See
// app/(portal)/rebuttals/page.tsx and the migration's header comment.
export async function GET() {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("rebuttals")
    .select(REBUTTAL_COLUMNS)
    .eq("agent_id", auth.session.agent.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rebuttals: data });
}

// There is no POST here — rebuttals are only ever created by the
// log-new-rebuttal Edge Function tool, mid-call.

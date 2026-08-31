import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { embedText } from "@/lib/embeddings";
import type { Rebuttal } from "@/types/database";

const REBUTTAL_COLUMNS =
  "id, script, objection_text, answer_text, status, times_matched, source_call_id, created_at, approved_at";

/**
 * Agent-only, and only the agent this draft was assigned to — no admin
 * bypass here (unlike authorizeRow), since admin never sees rebuttals at
 * all. Approving is what makes a rebuttal usable on every future call for
 * this script, not just this agent's own — see the migration's header.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("rebuttals")
    .select("id, agent_id, objection_text, answer_text, status")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return NextResponse.json({ error: "rebuttal not found" }, { status: 404 });
  }
  if (existing.agent_id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "this rebuttal belongs to another agent" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { objection_text, answer_text, status } = body ?? {};

  const updates: Partial<Rebuttal> = {};
  if (objection_text !== undefined) {
    if (typeof objection_text !== "string" || !objection_text.trim()) {
      return NextResponse.json({ error: "objection_text can't be empty" }, { status: 400 });
    }
    updates.objection_text = objection_text.trim();
  }
  if (answer_text !== undefined) {
    if (typeof answer_text !== "string" || !answer_text.trim()) {
      return NextResponse.json({ error: "answer_text can't be empty" }, { status: 400 });
    }
    updates.answer_text = answer_text.trim();
  }

  if (status !== undefined) {
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }
    updates.status = status;

    if (status === "approved") {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = auth.session.agent.id;

      // Embedding is generated here, once — this is the moment a rebuttal
      // becomes eligible for lookup-rebuttal to find, for every agent.
      const textToEmbed = (updates.objection_text ?? existing.objection_text).trim();
      try {
        updates.embedding = await embedText(textToEmbed);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? `couldn't generate embedding: ${err.message}`
                : "couldn't generate embedding",
          },
          { status: 502 }
        );
      }
    } else {
      updates.approved_at = null;
      updates.approved_by = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("rebuttals")
    .update(updates)
    .eq("id", id)
    .select(REBUTTAL_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rebuttal: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from("rebuttals")
    .select("id, agent_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "rebuttal not found" }, { status: 404 });
  }
  if (existing.agent_id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "this rebuttal belongs to another agent" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin.from("rebuttals").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

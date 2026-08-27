import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import type { AgentAvailabilityHour } from "@/types/database";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** This agent's local weekly-hours preference — see the migration for why this isn't the real booking source. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("agent_availability_hours")
    .select("id, weekday, start_time, end_time")
    .eq("agent_id", id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ hours: data ?? [] });
}

/** Replaces this agent's whole weekly-hours set in one shot — the editor always saves the full week. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only set your own availability" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const hours = body?.hours;

  if (!Array.isArray(hours)) {
    return NextResponse.json({ error: "hours must be an array" }, { status: 400 });
  }

  const rows: Pick<AgentAvailabilityHour, "agent_id" | "weekday" | "start_time" | "end_time">[] = [];
  for (const entry of hours) {
    const { weekday, start_time, end_time } = entry ?? {};
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "weekday must be 0-6" }, { status: 400 });
    }
    if (typeof start_time !== "string" || !TIME_RE.test(start_time)) {
      return NextResponse.json({ error: "start_time must be HH:MM" }, { status: 400 });
    }
    if (typeof end_time !== "string" || !TIME_RE.test(end_time)) {
      return NextResponse.json({ error: "end_time must be HH:MM" }, { status: 400 });
    }
    if (end_time <= start_time) {
      return NextResponse.json(
        { error: "each range's end time must be after its start time" },
        { status: 400 }
      );
    }
    rows.push({ agent_id: id, weekday, start_time, end_time });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("agent_availability_hours")
    .delete()
    .eq("agent_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ hours: [] });
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("agent_availability_hours")
    .insert(rows)
    .select("id, weekday, start_time, end_time")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ hours: data ?? [] });
}

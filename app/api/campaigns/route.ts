import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { CALL_TYPES, type CallType } from "@/types/database";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const query = applyAgentScope(
    supabaseAdmin
      .from("dial_campaigns")
      .select(
        "*, windows:dial_campaign_windows(id, start_time, end_time, call_type), members:dial_campaign_customers(id, status, customer_id, window_id, sort_order, customer:customers(id, name, phone, status))"
      )
      .order("created_at", { ascending: false }),
    auth.session
  );

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { start_date, end_date, timezone, windows, gap_seconds, voice_gender } = body ?? {};

  if (typeof start_date !== "string" || !DATE_RE.test(start_date)) {
    return NextResponse.json({ error: "start_date must be a valid date" }, { status: 400 });
  }
  if (typeof end_date !== "string" || !DATE_RE.test(end_date)) {
    return NextResponse.json({ error: "end_date must be a valid date" }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "end_date can't be before start_date" }, { status: 400 });
  }
  if (typeof timezone !== "string" || timezone.trim().length === 0) {
    return NextResponse.json({ error: "timezone is required (the browser's IANA zone)" }, { status: 400 });
  }

  if (!Array.isArray(windows) || windows.length === 0) {
    return NextResponse.json({ error: "Add at least one schedule" }, { status: 400 });
  }
  const parsedWindows: { start_time: string; end_time: string; call_type: CallType | null; customer_ids: string[] }[] = [];
  const allCustomerIds = new Set<string>();
  for (const window of windows) {
    const start = window?.start_time;
    const end = window?.end_time;
    if (typeof start !== "string" || !TIME_RE.test(start)) {
      return NextResponse.json({ error: "Each schedule's start time must be a valid HH:MM time" }, { status: 400 });
    }
    if (typeof end !== "string" || !TIME_RE.test(end)) {
      return NextResponse.json({ error: "Each schedule's end time must be a valid HH:MM time" }, { status: 400 });
    }
    if (end === start) {
      return NextResponse.json({ error: "A schedule's end time can't equal its start time" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json(
        { error: "Schedules can't cross midnight — add a second schedule instead." },
        { status: 400 }
      );
    }
    const callType = window?.call_type;
    if (callType !== undefined && callType !== null && !CALL_TYPES.includes(callType)) {
      return NextResponse.json({ error: `call_type must be one of ${CALL_TYPES.join(", ")}` }, { status: 400 });
    }
    const customerIds: string[] = Array.isArray(window?.customer_ids) ? window.customer_ids : [];
    if (customerIds.length === 0) {
      return NextResponse.json({ error: "Each schedule needs at least one customer" }, { status: 400 });
    }
    customerIds.forEach((id) => allCustomerIds.add(id));
    parsedWindows.push({ start_time: start, end_time: end, call_type: callType ?? null, customer_ids: customerIds });
  }

  if (voice_gender !== undefined && voice_gender !== null && voice_gender !== "male" && voice_gender !== "female") {
    return NextResponse.json({ error: 'voice_gender must be "male" or "female"' }, { status: 400 });
  }

  const ids = [...allCustomerIds];
  const { data: ownedCustomers, error: custError } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("agent_id", auth.session.agent.id)
    .in("id", ids);

  if (custError) return NextResponse.json({ error: custError.message }, { status: 500 });
  if ((ownedCustomers?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: "One or more customers are not yours" }, { status: 403 });
  }

  // Delay Between Calls is the agent's own Auto-Dial Settings default
  // (sales_agents.call_gap_seconds) unless this particular run overrides it.
  const { data: agentRow } = await supabaseAdmin
    .from("sales_agents")
    .select("call_gap_seconds")
    .eq("id", auth.session.agent.id)
    .maybeSingle();

  const { data: campaign, error: campError } = await supabaseAdmin
    .from("dial_campaigns")
    .insert({
      agent_id: auth.session.agent.id,
      start_date,
      end_date,
      timezone,
      gap_seconds: gap_seconds ?? agentRow?.call_gap_seconds ?? 60,
      voice_gender: voice_gender ?? null,
      status: "draft",
    })
    .select("*")
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: campError?.message ?? "Failed to create campaign" }, { status: 500 });
  }

  // Inserted one at a time (rather than bulk) so each window's id is known
  // immediately, to scope its own customer_ids below — a bulk insert's
  // returned row order isn't guaranteed to match the request order.
  const windowRows: { id: string; start_time: string; end_time: string; call_type: CallType | null }[] = [];
  for (const window of parsedWindows) {
    const { data: windowRow, error: windowError } = await supabaseAdmin
      .from("dial_campaign_windows")
      .insert({
        campaign_id: campaign.id,
        start_time: window.start_time,
        end_time: window.end_time,
        call_type: window.call_type,
      })
      .select("*")
      .single();
    if (windowError || !windowRow) {
      await supabaseAdmin.from("dial_campaigns").delete().eq("id", campaign.id);
      return NextResponse.json({ error: windowError?.message ?? "Failed to create schedules" }, { status: 500 });
    }
    windowRows.push(windowRow);
  }

  const members = parsedWindows.flatMap((window, windowIndex) =>
    window.customer_ids.map((customer_id, customerIndex) => ({
      campaign_id: campaign.id,
      window_id: windowRows[windowIndex].id,
      customer_id,
      sort_order: customerIndex,
    }))
  );

  const { error: memberError } = await supabaseAdmin.from("dial_campaign_customers").insert(members);
  if (memberError) {
    await supabaseAdmin.from("dial_campaigns").delete().eq("id", campaign.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign: { ...campaign, windows: windowRows } }, { status: 201 });
}

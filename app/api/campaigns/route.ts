import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";

export async function GET() {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  let query = applyAgentScope(
    supabaseAdmin
      .from("dial_campaigns")
      .select("*, members:dial_campaign_customers(id, status, customer_id, sort_order, customer:customers(id, name, phone, status))")
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
  const { window_start, window_end, customer_ids, gap_seconds } = body ?? {};

  if (!window_start || !window_end) {
    return NextResponse.json(
      { error: "window_start and window_end are required" },
      { status: 400 }
    );
  }

  const ids: string[] = Array.isArray(customer_ids) ? customer_ids : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one customer" }, { status: 400 });
  }

  const startMs = new Date(window_start).getTime();
  const endMs = new Date(window_end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Invalid time window" }, { status: 400 });
  }

  const { data: ownedCustomers, error: custError } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("agent_id", auth.session.agent.id)
    .in("id", ids);

  if (custError) return NextResponse.json({ error: custError.message }, { status: 500 });
  if ((ownedCustomers?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: "One or more customers are not yours" }, { status: 403 });
  }

  const { data: campaign, error: campError } = await supabaseAdmin
    .from("dial_campaigns")
    .insert({
      agent_id: auth.session.agent.id,
      window_start,
      window_end,
      gap_seconds: gap_seconds ?? 120,
      status: "draft",
    })
    .select("*")
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: campError?.message ?? "Failed to create campaign" }, { status: 500 });
  }

  const members = ids.map((customer_id, index) => ({
    campaign_id: campaign.id,
    customer_id,
    sort_order: index,
  }));

  const { error: memberError } = await supabaseAdmin.from("dial_campaign_customers").insert(members);
  if (memberError) {
    await supabaseAdmin.from("dial_campaigns").delete().eq("id", campaign.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}

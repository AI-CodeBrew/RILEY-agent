import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { advanceCampaign } from "@/lib/campaign";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import type { DialCampaign } from "@/types/database";

type CampaignRow = DialCampaign & { agent_id: string | null };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<CampaignRow>("dial_campaigns", id, auth.session);
  if ("error" in authorized) return authorized.error;

  // This route is agent-only (see requireApiSession above) — agents never
  // see a customer's phone number, so it's dropped from the select entirely
  // rather than redacted after the fact.
  const [{ data: members, error }, { data: windows, error: windowsError }] = await Promise.all([
    supabaseAdmin
      .from("dial_campaign_customers")
      .select("*, customer:customers(id, name, email, status, call_insights, last_call_summary)")
      .eq("campaign_id", id)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("dial_campaign_windows")
      .select("id, start_time, end_time, call_type")
      .eq("campaign_id", id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (windowsError) return NextResponse.json({ error: windowsError.message }, { status: 500 });
  return NextResponse.json({
    campaign: { ...authorized.row, windows: windows ?? [] },
    members: members ?? [],
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<CampaignRow>("dial_campaigns", id, auth.session);
  if ("error" in authorized) return authorized.error;

  const result = await advanceCampaign(id);
  return NextResponse.json(result);
}

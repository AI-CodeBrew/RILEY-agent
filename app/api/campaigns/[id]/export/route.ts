import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import type { DialCampaign } from "@/types/database";

type CampaignRow = DialCampaign & { agent_id: string | null };

function csvEscape(value: string | null | undefined) {
  const text = value ?? "";
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<CampaignRow>("dial_campaigns", id, auth.session);
  if ("error" in authorized) return authorized.error;

  const { data: members, error } = await supabaseAdmin
    .from("dial_campaign_customers")
    .select(
      "status, customer:customers(name, phone, email, status, spouse_name, employment_status, household_type, preferred_meeting_time, last_call_summary, call_insights, follow_up_at)"
    )
    .eq("campaign_id", id)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "name",
    "phone",
    "email",
    "status",
    "campaign_member_status",
    "call_received",
    "spouse_name",
    "household_type",
    "employment_status",
    "preferred_meeting_time",
    "meeting_locked_time",
    "follow_up_needed",
    "key_notes",
    "summary",
  ].join(",");

  const rows = (members ?? []).map((row) => {
    const member = row as {
      status: string;
      customer: Record<string, unknown> | null;
    };
    const c = member.customer;
    const insights = (c?.call_insights ?? {}) as Record<string, unknown>;
    return [
      csvEscape(String(c?.name ?? "")),
      csvEscape(String(c?.phone ?? "")),
      csvEscape(String(c?.email ?? "")),
      csvEscape(String(c?.status ?? "")),
      csvEscape(String(member.status ?? "")),
      csvEscape(String(insights.call_received ?? "")),
      csvEscape(String(c?.spouse_name ?? insights.spouse_name ?? "")),
      csvEscape(String(c?.household_type ?? insights.household_type ?? "")),
      csvEscape(String(c?.employment_status ?? insights.employment_status ?? "")),
      csvEscape(String(c?.preferred_meeting_time ?? insights.preferred_meeting_time ?? "")),
      csvEscape(String(insights.meeting_locked_time ?? "")),
      csvEscape(String(insights.follow_up_needed ?? "")),
      csvEscape(String(insights.key_notes ?? "")),
      csvEscape(String(c?.last_call_summary ?? "")),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${id}.csv"`,
    },
  });
}

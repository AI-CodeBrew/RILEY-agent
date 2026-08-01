import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import type { DialCampaign } from "@/types/database";

type CampaignRow = DialCampaign & { agent_id: string | null };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<CampaignRow>("dial_campaigns", id, auth.session);
  if ("error" in authorized) return authorized.error;

  await supabaseAdmin
    .from("dial_campaigns")
    .update({
      status: "stopped",
      current_customer_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ status: "stopped" });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { advanceCampaign } from "@/lib/campaign";
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

  const now = new Date().toISOString();
  const windowStart = authorized.row.window_start;
  const status = new Date(windowStart).getTime() > Date.now() ? "scheduled" : "running";

  await supabaseAdmin
    .from("dial_campaigns")
    .update({ status, updated_at: now })
    .eq("id", id);

  const result = await advanceCampaign(id);
  return NextResponse.json({ status, ...result });
}

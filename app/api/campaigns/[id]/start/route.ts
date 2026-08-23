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

  // Optimistic "running" — advanceCampaign immediately re-derives the real
  // status (scheduled if the date range hasn't started yet, completed if it
  // already ended) on the very next line, so this is just a reasonable
  // starting point rather than something that has to be exactly right.
  await supabaseAdmin
    .from("dial_campaigns")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", id);

  const result = await advanceCampaign(id);
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { advanceCampaign } from "@/lib/campaign";

const BATCH_SIZE = 50;

/** Ring-timeout worker dispatch from advanceCampaign can outlive the response. */
export const maxDuration = 60;

/**
 * Hit every minute by a pg_cron job (see
 * supabase/migrations/00000000000052_campaign_advance_cron.sql) with a
 * bearer token matching CAMPAIGN_CRON_SECRET.
 *
 * advanceCampaign (lib/campaign.ts) is what actually places the next call
 * for a running/scheduled campaign — until this route existed, it was only
 * ever invoked from the browser (CampaignPanel.tsx's client-side 15s
 * setInterval, and once from the Start button), so a campaign silently
 * stopped dialing the moment the agent closed the tab or the browser
 * throttled/suspended it in the background. This is a server-side backstop,
 * same shape as process-retries/reconcile-live-calls: it re-derives the same
 * "is it safe to dial right now" state advanceCampaign already checks
 * (window open, gap_seconds elapsed, agent not already on a call), so
 * running it alongside the still-active client-side tick is harmless — it
 * just makes forward progress even when nobody has the page open.
 */
export async function POST(request: Request) {
  const secret = process.env.CAMPAIGN_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: campaigns, error } = await supabaseAdmin
    .from("dial_campaigns")
    .select("id")
    .in("status", ["running", "scheduled"])
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  for (const { id } of campaigns ?? []) {
    try {
      const result = await advanceCampaign(id);
      results[id] = result.action;
    } catch (err) {
      results[id] = err instanceof Error ? err.message : "error";
    }
  }

  return NextResponse.json({ ok: true, considered: campaigns?.length ?? 0, results });
}

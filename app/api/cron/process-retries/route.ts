import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import { isWithinAnyWindow, loadCampaignWindows, zonedDateString } from "@/lib/campaign-schedule";
import type { Customer, SalesAgent } from "@/types/database";

const BATCH_SIZE = 25;

/**
 * Hit every 5 minutes by a pg_cron job (see
 * supabase/migrations/00000000000017_call_retry_scheduling.sql) with a
 * bearer token matching RETRY_CRON_SECRET. Dials anyone whose
 * `customers.next_retry_at` has arrived — that column is only ever set by
 * resolve-call-outcome (supabase/functions/_shared/resolve-call-outcome.ts)
 * after a follow_up/no_answer outcome from a campaign-originated call,
 * already clamped into that campaign's own windows/end_date. This route
 * re-checks the same campaign at dial time too (defense-in-depth against
 * clock drift/DST edges, or the campaign's date range having since ended).
 *
 * `retry_count` is *not* touched here — resolve-call-outcome's
 * nextRetryPatch is the single place that decides its next value (it reads
 * the count this same route left in place from the previous attempt), so
 * this route only clears `next_retry_at` after dialing, to stop the next
 * cron tick from picking the same customer back up while this call is
 * still in flight; leaving it in place on failure lets that tick retry it.
 */
export async function POST(request: Request) {
  const secret = process.env.RETRY_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: dueRaw, error } = await supabaseAdmin
    .from("customers")
    .select("*, agent:sales_agents(*), campaign:dial_campaigns(id, end_date)")
    .in("status", ["follow_up", "no_answer"])
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (dueRaw ?? []) as (Customer & {
    agent: SalesAgent | null;
    campaign: { id: string; end_date: string } | null;
  })[];

  let dialed = 0;
  let skipped = 0;

  for (const { agent, campaign, ...customer } of due) {
    if (!agent || !campaign) {
      // No agent to dial from, or the originating campaign is gone —
      // nothing left to clamp into.
      skipped++;
      continue;
    }

    const now = new Date();
    const today = zonedDateString(now, agent.timezone);
    const windows = await loadCampaignWindows(campaign.id);

    if (today > campaign.end_date || !isWithinAnyWindow(windows, now, agent.timezone)) {
      // Outside the campaign's date range or today's windows right now —
      // leave next_retry_at as-is so the next cron tick (or the window
      // opening) picks it back up rather than dialing off-schedule.
      skipped++;
      continue;
    }

    try {
      await triggerCallForCustomer({
        customer,
        agent,
        triggeredBy: agent.id,
        voiceGender: agent.default_voice_gender,
        campaignId: customer.retry_campaign_id,
      });
      await supabaseAdmin
        .from("customers")
        .update({ next_retry_at: null })
        .eq("id", customer.id);
      dialed++;
    } catch {
      // Agent or customer already on a live call, invalid phone, etc. —
      // leave next_retry_at as-is so the next cron tick retries it.
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, considered: due.length, dialed, skipped });
}

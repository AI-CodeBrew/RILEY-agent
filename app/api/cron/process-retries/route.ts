import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import type { Customer, SalesAgent } from "@/types/database";

const BATCH_SIZE = 25;

/**
 * Hit every 5 minutes by a pg_cron job (see
 * supabase/migrations/00000000000017_call_retry_scheduling.sql) with a
 * bearer token matching RETRY_CRON_SECRET. Dials anyone whose
 * `customers.next_retry_at` has arrived — that column is only ever set by
 * resolve-call-outcome (supabase/functions/_shared/resolve-call-outcome.ts)
 * after a follow_up/no_answer outcome, clamped into the calling window of
 * the auto-dial campaign that placed the original call, so this route
 * doesn't need any window/day-rollover logic of its own — it just fires
 * whenever the timestamp says to. It does pass `retry_campaign_id` back
 * into the new call so the campaign's window keeps applying on the next
 * retry too, not just the first one.
 */
export async function POST(request: Request) {
  const secret = process.env.RETRY_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: dueRaw, error } = await supabaseAdmin
    .from("customers")
    .select("*, agent:sales_agents(*)")
    .in("status", ["follow_up", "no_answer"])
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (dueRaw ?? []) as (Customer & { agent: SalesAgent | null })[];

  let dialed = 0;
  let skipped = 0;

  for (const { agent, ...customer } of due) {
    if (!agent) {
      // No agent on file to dial from or pull calling-hours settings from.
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
        .update({ retry_count: customer.retry_count + 1, next_retry_at: null })
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

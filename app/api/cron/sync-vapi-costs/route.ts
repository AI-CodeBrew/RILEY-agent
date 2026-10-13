import { NextResponse } from "next/server";
import { syncVapiCosts } from "@/lib/vapi-cost";

export const maxDuration = 60;

/** A little over a day, so each call is re-checked on ~26 hourly runs before it ages out. */
const WINDOW_MS = 26 * 3_600_000;

/**
 * Hit hourly by a pg_cron job (see
 * supabase/migrations/00000000000068_sync_vapi_costs_cron.sql). Keeps
 * `calls.cost` equal to what Vapi charged: the end-of-call webhook saves the
 * cost first, but some calls never get one (webhook missed) and Vapi
 * occasionally re-prices a call shortly after it ends. Vapi drops individual
 * calls after about two weeks, so this is what makes the saved history
 * trustworthy for any older range the admin Costs page is asked for.
 *
 * Shares RETRY_CRON_SECRET with process-retries rather than adding another
 * secret to provision in both Vercel and the Supabase vault.
 */
export async function POST(request: Request) {
  const secret = process.env.RETRY_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  try {
    const result = await syncVapiCosts({ fromMs: now - WINDOW_MS, toMs: now });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    );
  }
}

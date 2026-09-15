import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Hit every 15 minutes by a pg_cron job (see
 * supabase/migrations/00000000000040_scheduled_recontact.sql) with a bearer
 * token matching RECONTACT_CRON_SECRET.
 *
 * A due `next_contact_at` (set from any status via the customer detail
 * page's "Contact again" panel, ScheduleRecontactPanel.tsx) does NOT get
 * dialed automatically from here — a customer becoming due only makes them
 * *eligible*: they show up with a "Due" badge in the Auto Dialer
 * (app/(portal)/campaigns/CampaignPanel.tsx), selectable in bulk via its
 * "Select due recontacts" control, filterable by category. An agent still
 * has to press "Start auto-dial" for anything to actually be called — same
 * as every other customer in that screen. This route no longer calls
 * triggerCallForCustomer; it only reports how many are currently due, so the
 * cron tick stays cheap and side-effect-free. (Earlier versions of this
 * route did dial directly, the same way app/api/cron/process-retries still
 * does for the separate follow_up/no_answer auto-retry chain — that
 * behavior was replaced with the Auto Dialer integration described above.)
 */
export async function POST(request: Request) {
  const secret = process.env.RECONTACT_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Do-not-call is permanent — clear a stale schedule set before that status
  // was applied, rather than leaving it to show up as "due" forever in the
  // Auto Dialer (which already excludes do_not_call customers outright).
  await supabaseAdmin
    .from("customers")
    .update({ next_contact_at: null })
    .eq("status", "do_not_call")
    .not("next_contact_at", "is", null);

  const { count, error } = await supabaseAdmin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .not("next_contact_at", "is", null)
    .lte("next_contact_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, due: count ?? 0 });
}

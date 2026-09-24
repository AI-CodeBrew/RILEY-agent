import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toE164 } from "@/lib/format";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import {
  getDriveFileMeta,
  getFirstSheetTitle,
  getValidAccessToken,
  letterToColumnIndex,
  readSheetRowsAfter,
} from "@/lib/google-sheets";
import type { GoogleSheetConnection, SalesAgent } from "@/types/database";

const BATCH_SIZE = 25;

/**
 * Hit every 15 seconds by a pg_cron job (see
 * supabase/migrations/00000000000055_google_sheets_leads.sql) with a bearer
 * token matching SHEETS_CRON_SECRET. For each connected agent: skips the
 * Sheets read entirely if Drive's modifiedTime hasn't changed since the last
 * tick, otherwise reads only the rows after last_row_synced, creates a
 * `customers` row per new lead (skipping ones that already exist by phone,
 * same dedupe as the manual CSV import — see app/api/customers/import), and
 * immediately triggers an AI call for each one actually created.
 */
export async function POST(request: Request) {
  const secret = process.env.SHEETS_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: connectionsRaw, error } = await supabaseAdmin
    .from("google_sheet_connections")
    .select("*")
    .eq("status", "connected")
    .not("spreadsheet_id", "is", null)
    .not("name_column", "is", null)
    .not("phone_column", "is", null)
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const connections = (connectionsRaw ?? []) as GoogleSheetConnection[];
  const results: Record<string, string> = {};

  for (const connection of connections) {
    try {
      results[connection.agent_id] = await processConnection(connection);
    } catch (err) {
      const invalidGrant = (err as Error & { invalidGrant?: boolean }).invalidGrant;
      if (invalidGrant) {
        await supabaseAdmin
          .from("google_sheet_connections")
          .update({ google_refresh_token: null, status: "disconnected" })
          .eq("id", connection.id);
        results[connection.agent_id] = "disconnected: token revoked";
        continue;
      }
      const message = err instanceof Error ? err.message : "error";
      console.error(`process-sheet-leads: agent ${connection.agent_id} failed:`, message);
      results[connection.agent_id] = `error: ${message}`;
    }
  }

  return NextResponse.json({ ok: true, considered: connections.length, results });
}

async function processConnection(connection: GoogleSheetConnection): Promise<string> {
  if (!connection.google_refresh_token || !connection.spreadsheet_id) return "not fully connected";

  const accessToken = await getValidAccessToken(connection.google_refresh_token);
  const meta = await getDriveFileMeta(connection.spreadsheet_id, accessToken);

  if (connection.last_modified_time && meta.modifiedTime === connection.last_modified_time) {
    return "unchanged";
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", connection.agent_id)
    .maybeSingle();

  if (!agent) return "agent not found";

  const nameIdx = letterToColumnIndex(connection.name_column!);
  const phoneIdx = letterToColumnIndex(connection.phone_column!);
  const emailIdx = connection.email_column ? letterToColumnIndex(connection.email_column) : -1;

  const sheetTitle = await getFirstSheetTitle(connection.spreadsheet_id, accessToken);
  const { rows, totalRowCount } = await readSheetRowsAfter(
    connection.spreadsheet_id,
    sheetTitle,
    connection.last_row_synced,
    accessToken
  );

  const candidates: { name: string; phone: string; email: string | null }[] = [];
  for (const row of rows) {
    const name = (row[nameIdx] ?? "").trim();
    const phoneRaw = (row[phoneIdx] ?? "").trim();
    if (!name || !phoneRaw) continue;
    const phone = toE164(phoneRaw);
    if (!phone) continue;
    const email = emailIdx !== -1 ? (row[emailIdx] ?? "").trim() || null : null;
    candidates.push({ name, phone, email });
  }

  let created = 0;
  if (candidates.length > 0) {
    const phones = Array.from(new Set(candidates.map((c) => c.phone)));
    const { data: existingRows } = await supabaseAdmin
      .from("customers")
      .select("phone")
      .eq("agent_id", connection.agent_id)
      .in("phone", phones);
    const existingPhones = new Set((existingRows ?? []).map((c) => c.phone));

    const seen = new Set<string>();
    const toInsert = candidates.filter((c) => {
      if (existingPhones.has(c.phone) || seen.has(c.phone)) return false;
      seen.add(c.phone);
      return true;
    });

    if (toInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("customers")
        .insert(toInsert.map((c) => ({ name: c.name, phone: c.phone, email: c.email, agent_id: connection.agent_id })))
        .select("*");

      if (insertError) throw new Error(insertError.message);
      created = inserted?.length ?? 0;

      for (const customer of inserted ?? []) {
        try {
          await triggerCallForCustomer({
            customer,
            agent: agent as SalesAgent,
            triggeredBy: connection.agent_id,
            voiceGender: agent.default_voice_gender,
          });
        } catch (err) {
          // Agent already on a call, invalid number, etc. — the lead is
          // still saved as a customer; it just doesn't get an immediate
          // call. Not fatal to the rest of this batch.
          console.error(`process-sheet-leads: could not call new lead ${customer.id}:`, err);
        }
      }
    }
  }

  await supabaseAdmin
    .from("google_sheet_connections")
    .update({
      last_row_synced: totalRowCount,
      last_modified_time: meta.modifiedTime,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return `${created} new lead(s) of ${rows.length} row(s) read`;
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toE164 } from "@/lib/format";
import { CALL_TYPES, type CallType } from "@/types/database";
import { advancePriorityQueue } from "@/lib/campaign";
import {
  getValidAccessToken,
  letterToColumnIndex,
  readSheetRowsAfter,
} from "@/lib/google-sheets";
import type { GoogleSheetConnection } from "@/types/database";

const BATCH_SIZE = 25;

/**
 * Any spelling of a call type in the sheet — "will_kit", "Will Kit", "WILL-KIT",
 * "willkit" — maps to the canonical value ("WILL_KIT"). Case, spaces, dashes and
 * underscores are all ignored; anything that isn't a known call type is null
 * (the agent's default script then applies).
 */
function parseCallType(value: string): CallType | null {
  const compact = value.toUpperCase().replace(/[^A-Z]/g, "");
  return CALL_TYPES.find((type) => type.replace(/_/g, "") === compact) ?? null;
}

/**
 * Hit every 15 seconds by a pg_cron job (see
 * supabase/migrations/00000000000055_google_sheets_leads.sql) with a bearer
 * token matching SHEETS_CRON_SECRET. For each connected agent: reads only the
 * rows after last_row_synced and creates a `customers` row per new lead
 * (skipping ones that already exist by phone, same dedupe as the manual CSV
 * import — see app/api/customers/import), tagged source='google_sheet' /
 * priority='high'. Calling them is the auto-dialer's priority queue's job
 * (advancePriorityQueue / advanceCampaign in lib/campaign.ts), drained at the
 * end of every tick.
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
  // The priority queue is drained on every tick, even when the sheet itself is
  // unchanged or Google's API errors out — a lead that couldn't be dialed
  // earlier (agent was busy) is waiting in `customers`, not in the sheet.
  let syncResult = "";
  let syncError: unknown = null;
  try {
    syncResult = await syncNewRows(connection);
  } catch (err) {
    syncError = err;
  }

  const queueResult = await drainPriorityQueue(connection.agent_id);
  if (syncError) throw syncError;
  return `${syncResult}; queue: ${queueResult}`;
}

/**
 * Dials the next waiting Google Sheets lead — but only when the agent has no
 * *running* campaign. A running campaign's own advanceCampaign already takes
 * priority leads ahead of its members (lib/campaign.ts), so doing it here too
 * would just risk two ticks racing for the same agent.
 */
async function drainPriorityQueue(agentId: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from("dial_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("status", "running");
  if (count) return "left to the running campaign";

  const result = await advancePriorityQueue(agentId);
  return result.message ? `${result.action} (${result.message})` : result.action;
}

async function syncNewRows(connection: GoogleSheetConnection): Promise<string> {
  if (!connection.google_refresh_token || !connection.spreadsheet_id) return "not fully connected";

  const accessToken = await getValidAccessToken(connection.google_refresh_token);

  const nameIdx = letterToColumnIndex(connection.name_column!);
  const phoneIdx = letterToColumnIndex(connection.phone_column!);
  const emailIdx = connection.email_column ? letterToColumnIndex(connection.email_column) : -1;
  const callTypeIdx = connection.call_type_column ? letterToColumnIndex(connection.call_type_column) : -1;

  // Read straight from the sheet every tick rather than first asking Drive
  // whether it changed: Drive's modifiedTime for a Sheet lags real edits by a
  // few minutes, which made new leads wait that long. One small values.get per
  // agent per tick; rows past the bookmark are usually none.
  const { rows, totalRowCount } = await readSheetRowsAfter(
    connection.spreadsheet_id,
    "",
    connection.last_row_synced,
    accessToken
  );

  // Why a row didn't become a customer — surfaced in this tick's response so
  // "0 new leads" is never a guessing game. Only masked phone tails are logged.
  const skipped: string[] = [];
  // True when the *last* row read was incomplete — see the hold-back below.
  let lastRowIncomplete = false;
  const candidates: { name: string; phone: string; email: string | null; callType: CallType | null }[] = [];
  for (const [i, row] of rows.entries()) {
    const sheetRow = connection.last_row_synced + 1 + i;
    const isLastRow = i === rows.length - 1;
    const name = (row[nameIdx] ?? "").trim();
    const phoneRaw = (row[phoneIdx] ?? "").trim();
    if (!name || !phoneRaw) {
      skipped.push(`row ${sheetRow}: ${!name ? "name" : "phone"} is empty`);
      if (isLastRow) lastRowIncomplete = true;
      continue;
    }
    const phone = toE164(phoneRaw);
    if (!phone) {
      const digitCount = phoneRaw.replace(/\D/g, "").length;
      skipped.push(`row ${sheetRow}: phone has ${digitCount} digits and isn't a recognized format`);
      if (isLastRow) lastRowIncomplete = true;
      continue;
    }
    const email = emailIdx !== -1 ? (row[emailIdx] ?? "").trim() || null : null;
    const callType = callTypeIdx !== -1 ? parseCallType(row[callTypeIdx] ?? "") : null;
    candidates.push({ name, phone, email, callType });
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
      if (existingPhones.has(c.phone) || seen.has(c.phone)) {
        skipped.push(`"${c.name}" (…${c.phone.slice(-4)}): phone already exists as a customer`);
        return false;
      }
      seen.add(c.phone);
      return true;
    });

    if (toInsert.length > 0) {
      // source/priority are what put these in the auto-dialer's priority
      // queue (see advancePriorityQueue / advanceCampaign in lib/campaign.ts);
      // status is left to its DB default of 'new'.
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("customers")
        .insert(
          toInsert.map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email,
            call_type: c.callType,
            agent_id: connection.agent_id,
            source: "google_sheet" as const,
            priority: "high" as const,
          }))
        )
        .select("id");

      if (insertError) throw new Error(insertError.message);
      created = inserted?.length ?? 0;
    }
  }

  await supabaseAdmin
    .from("google_sheet_connections")
    .update({
      // An incomplete last row may just be a row someone is still typing (or a
      // form write that hasn't finished landing) — leave it un-bookmarked so the
      // next tick re-reads it once it's complete. Once another row is appended
      // after it, it's no longer "last" and gets skipped for good.
      last_row_synced: lastRowIncomplete ? totalRowCount - 1 : totalRowCount,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  const skippedNote = skipped.length > 0 ? ` — skipped: ${skipped.join("; ")}` : "";
  return `${created} new lead(s) of ${rows.length} row(s) read${skippedNote}`;
}

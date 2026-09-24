import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import {
  columnIndexToLetter,
  getFirstSheetTitle,
  getSheetRowCount,
  getValidAccessToken,
  readSheetHeaders,
} from "@/lib/google-sheets";

/**
 * Saves which header is Name/Phone/Email and flips the connection to
 * "connected". Baselines last_row_synced to the sheet's *current* row
 * count, not 0 — see the migration comment: only rows added after this
 * point get imported, so connecting to a sheet with months of old ad leads
 * doesn't auto-call all of them at once.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const nameHeader = typeof body?.nameColumn === "string" ? body.nameColumn : null;
  const phoneHeader = typeof body?.phoneColumn === "string" ? body.phoneColumn : null;
  const emailHeader = typeof body?.emailColumn === "string" ? body.emailColumn : null;
  const callTypeHeader = typeof body?.callTypeColumn === "string" ? body.callTypeColumn : null;

  if (!nameHeader || !phoneHeader) {
    return NextResponse.json({ error: "nameColumn and phoneColumn are required" }, { status: 400 });
  }

  const { data: connection } = await supabaseAdmin
    .from("google_sheet_connections")
    .select("google_refresh_token, spreadsheet_id")
    .eq("agent_id", auth.session.agent.id)
    .maybeSingle();

  if (!connection?.google_refresh_token || !connection.spreadsheet_id) {
    return NextResponse.json({ error: "Pick a sheet first." }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection.google_refresh_token);
    const sheetTitle = await getFirstSheetTitle(connection.spreadsheet_id, accessToken);
    const headers = await readSheetHeaders(connection.spreadsheet_id, sheetTitle, accessToken);

    const nameIndex = headers.indexOf(nameHeader);
    const phoneIndex = headers.indexOf(phoneHeader);
    const emailIndex = emailHeader ? headers.indexOf(emailHeader) : -1;
    const callTypeIndex = callTypeHeader ? headers.indexOf(callTypeHeader) : -1;

    if (nameIndex === -1 || phoneIndex === -1) {
      return NextResponse.json(
        { error: "Those columns no longer match the sheet's headers — reopen the sheet picker and try again." },
        { status: 400 }
      );
    }

    const rowCount = await getSheetRowCount(connection.spreadsheet_id, sheetTitle, accessToken);

    const { error } = await supabaseAdmin
      .from("google_sheet_connections")
      .update({
        name_column: columnIndexToLetter(nameIndex),
        phone_column: columnIndexToLetter(phoneIndex),
        email_column: emailIndex !== -1 ? columnIndexToLetter(emailIndex) : null,
        call_type_column: callTypeIndex !== -1 ? columnIndexToLetter(callTypeIndex) : null,
        last_row_synced: rowCount,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", auth.session.agent.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the column mapping.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

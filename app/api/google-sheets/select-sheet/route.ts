import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { getDriveFileMeta, getFirstSheetTitle, getValidAccessToken, readSheetHeaders } from "@/lib/google-sheets";

/** Saves the sheet the agent picked via the Picker, and returns its header row so the frontend can render the column-mapping dropdowns. */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const spreadsheetId = typeof body?.spreadsheetId === "string" ? body.spreadsheetId : null;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetId is required" }, { status: 400 });
  }

  const { data: connection } = await supabaseAdmin
    .from("google_sheet_connections")
    .select("google_refresh_token")
    .eq("agent_id", auth.session.agent.id)
    .maybeSingle();

  if (!connection?.google_refresh_token) {
    return NextResponse.json({ error: "Connect your Google account first." }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection.google_refresh_token);
    const [meta, sheetTitle] = await Promise.all([
      getDriveFileMeta(spreadsheetId, accessToken),
      getFirstSheetTitle(spreadsheetId, accessToken),
    ]);
    const headers = await readSheetHeaders(spreadsheetId, sheetTitle, accessToken);

    if (headers.length === 0) {
      return NextResponse.json(
        { error: "This sheet doesn't have a header row — add column names in row 1 and try again." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("google_sheet_connections")
      .update({
        spreadsheet_id: spreadsheetId,
        spreadsheet_name: meta.name,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", auth.session.agent.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ spreadsheetName: meta.name, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that sheet.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google-sheets";

/**
 * Short-lived access token + the restricted browser API key, for the
 * frontend to open the Google Picker widget. Minted fresh on every call —
 * the Picker only needs it for the few seconds the dialog is open.
 */
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.GOOGLE_PICKER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Sheets isn't configured yet — GOOGLE_PICKER_API_KEY is missing." },
      { status: 500 }
    );
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
    // A Google OAuth client ID is "<project number>-<random>.apps.googleusercontent.com".
    // Picker needs the project number (setAppId) for drive.file to actually grant this
    // app access to the file the agent picks.
    const projectNumber = (process.env.GOOGLE_MEET_CLIENT_ID ?? "").split("-")[0];
    return NextResponse.json({ accessToken, apiKey, projectNumber });
  } catch (err) {
    const invalidGrant = (err as Error & { invalidGrant?: boolean }).invalidGrant;
    if (invalidGrant) {
      await supabaseAdmin
        .from("google_sheet_connections")
        .update({ google_refresh_token: null, status: "disconnected" })
        .eq("agent_id", auth.session.agent.id);
      return NextResponse.json(
        { error: "Your Google connection expired — reconnect and try again." },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Could not get a Google access token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

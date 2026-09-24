import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { encryptToken } from "@/lib/token-crypto";
import { consumeOAuthState } from "@/lib/oauth-state";
import {
  exchangeGoogleSheetsCode,
  getGoogleAccountEmail,
  googleSheetsRedirectUri,
} from "@/lib/google-sheets";

function settingsRedirect(request: Request, result: "connected" | "error", detail?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("google_sheets", result);
  if (detail) url.searchParams.set("google_sheets_detail", detail.slice(0, 300));
  return NextResponse.redirect(url);
}

/**
 * Google lands here after the agent approves (or cancels) the consent
 * screen. Same shape as app/api/oauth/google-meet/callback, except tokens
 * live on their own google_sheet_connections row (upserted by agent_id) so
 * a reconnect after a revoked/expired token doesn't lose the agent's
 * already-picked sheet and column mapping.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return settingsRedirect(request, "error");
  }

  const resolved = await consumeOAuthState(state, "google_sheets");
  if (!resolved) {
    return settingsRedirect(request, "error");
  }

  try {
    const tokens = await exchangeGoogleSheetsCode(code, googleSheetsRedirectUri(request.url));
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token — try disconnecting any prior Dialcom access at https://myaccount.google.com/permissions and reconnecting."
      );
    }
    const accountEmail = await getGoogleAccountEmail(tokens.access_token);

    const { data: existing } = await supabaseAdmin
      .from("google_sheet_connections")
      .select("id, spreadsheet_id, name_column, phone_column")
      .eq("agent_id", resolved.agentId)
      .maybeSingle();

    // A prior sheet + column mapping already on file (a reconnect) goes
    // straight back to "connected"; a brand-new row waits in "pending"
    // until the agent picks a sheet and maps columns.
    const status = existing?.spreadsheet_id && existing?.name_column && existing?.phone_column
      ? "connected"
      : "pending";

    const { error } = await supabaseAdmin.from("google_sheet_connections").upsert(
      {
        agent_id: resolved.agentId,
        google_refresh_token: await encryptToken(tokens.refresh_token),
        google_account_email: accountEmail,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id" }
    );

    if (error) throw new Error(error.message);

    return settingsRedirect(request, "connected");
  } catch (err) {
    console.error("google sheets oauth callback failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return settingsRedirect(request, "error", detail);
  }
}

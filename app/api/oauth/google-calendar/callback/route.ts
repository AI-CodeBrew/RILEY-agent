import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { encryptToken } from "@/lib/token-crypto";
import { consumeOAuthState } from "@/lib/oauth-state";
import { exchangeGoogleMeetCode, getGoogleAccountEmail } from "@/lib/google-meet";
import { googleCalendarRedirectUri } from "@/lib/google-calendar";

function settingsRedirect(request: Request, result: "connected" | "error", detail?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("google_calendar", result);
  if (detail) url.searchParams.set("google_calendar_detail", detail.slice(0, 300));
  return NextResponse.redirect(url);
}

/**
 * Google lands here after the agent approves (or cancels) the consent
 * screen. Unauthenticated by session — `state` is the only trust anchor,
 * since this is a redirect from Google, not a fetch from our own app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return settingsRedirect(request, "error");
  }

  const resolved = await consumeOAuthState(state, "google_calendar");
  if (!resolved) {
    return settingsRedirect(request, "error");
  }

  try {
    const tokens = await exchangeGoogleMeetCode(code, googleCalendarRedirectUri(request.url));
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token — remove the app's access at https://myaccount.google.com/permissions and connect again."
      );
    }
    const accountEmail = await getGoogleAccountEmail(tokens.access_token);

    // Upsert keeps the agent's calendar picks across a reconnect (e.g. after
    // a revoked token) — only the credentials change.
    const { error } = await supabaseAdmin.from("google_calendar_connections").upsert(
      {
        agent_id: resolved.agentId,
        google_access_token: await encryptToken(tokens.access_token),
        google_refresh_token: await encryptToken(tokens.refresh_token),
        google_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        google_account_email: accountEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id" }
    );
    if (error) throw new Error(error.message);

    return settingsRedirect(request, "connected");
  } catch (err) {
    console.error("google calendar oauth callback failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return settingsRedirect(request, "error", detail);
  }
}

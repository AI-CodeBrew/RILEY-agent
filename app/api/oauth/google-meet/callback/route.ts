import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { encryptToken } from "@/lib/token-crypto";
import { consumeOAuthState } from "@/lib/oauth-state";
import {
  exchangeGoogleMeetCode,
  getGoogleAccountEmail,
  googleMeetRedirectUri,
} from "@/lib/google-meet";
import type { SalesAgent } from "@/types/database";

function settingsRedirect(request: Request, result: "connected" | "error", detail?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("google_meet", result);
  // TEMP: surfaces the real failure reason in the Settings toast while
  // wiring up the Google Meet integration — remove once the flow is
  // confirmed working.
  if (detail) url.searchParams.set("google_meet_detail", detail.slice(0, 300));
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

  const resolved = await consumeOAuthState(state, "google_meet");
  if (!resolved) {
    return settingsRedirect(request, "error");
  }

  try {
    const tokens = await exchangeGoogleMeetCode(code, googleMeetRedirectUri(request.url));
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token — try disconnecting any prior Dialcom access at https://myaccount.google.com/permissions and reconnecting."
      );
    }
    const accountEmail = await getGoogleAccountEmail(tokens.access_token);

    const { data: agent } = await supabaseAdmin
      .from("sales_agents")
      .select("video_provider")
      .eq("id", resolved.agentId)
      .maybeSingle();

    const updates: Partial<SalesAgent> = {
      google_access_token: await encryptToken(tokens.access_token),
      google_refresh_token: await encryptToken(tokens.refresh_token),
      google_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_account_email: accountEmail,
      google_connected_at: new Date().toISOString(),
    };
    // First video provider connected becomes the default — an agent who
    // only ever connects one never has to visit a picker.
    if (!agent?.video_provider) {
      updates.video_provider = "google_meet";
    }

    const { error } = await supabaseAdmin
      .from("sales_agents")
      .update(updates)
      .eq("id", resolved.agentId);

    if (error) throw new Error(error.message);

    return settingsRedirect(request, "connected");
  } catch (err) {
    console.error("google meet oauth callback failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return settingsRedirect(request, "error", detail);
  }
}

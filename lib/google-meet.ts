/**
 * Google Meet OAuth connection flow (used by the /api/oauth/google-meet/*
 * routes) — separate from supabase/functions/_shared/google-meet.ts, which
 * is the Deno-side module that actually creates the Meet space at booking
 * time via the Meet REST API. This file only handles "an agent connecting
 * their own Google account."
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Meet-space-creation access (the Meet REST API's own scope, no Calendar access) + enough identity to show which account is connected. */
export const GOOGLE_MEET_SCOPES =
  "https://www.googleapis.com/auth/meetings.space.created https://www.googleapis.com/auth/userinfo.email";

export { AUTHORIZE_URL as GOOGLE_MEET_AUTHORIZE_URL };

/** Must resolve identically in /start and /callback — it's part of what Google validates the code exchange against. */
export function googleMeetRedirectUri(requestUrl: string): string {
  return new URL("/api/oauth/google-meet/callback", requestUrl).toString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

export interface GoogleMeetTokens {
  access_token: string;
  /** Only present when Google actually issues one — see the `prompt=consent` note in /start; absent on a re-consent it decides to skip. */
  refresh_token?: string;
  expires_in: number;
}

/** Exchanges the authorization code from Google's redirect for tokens. */
export async function exchangeGoogleMeetCode(
  code: string,
  redirectUri: string
): Promise<GoogleMeetTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_MEET_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_MEET_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/** The connected Google account's email, for display on the Settings page. */
export async function getGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

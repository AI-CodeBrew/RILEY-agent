/**
 * Google Meet OAuth connection flow (used by the /api/oauth/google-meet/*
 * routes) — "an agent connecting their own Google account" — plus the
 * Node-side twins of supabase/functions/_shared/google-meet.ts's
 * createGoogleMeetMeeting/refreshGoogleAccessToken, which the portal's
 * manual "Add appointment" uses (see lib/appointment-video-link.ts). The
 * Deno module still covers appointments Riley books on a call.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SPACES_URL = "https://meet.googleapis.com/v2/spaces";

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

/** Creates a Google Meet space via the Meet REST API, returns its join link. A space isn't tied to a start/end time — the link just works whenever it's clicked. */
export async function createGoogleMeetMeeting(accessToken: string): Promise<string> {
  const res = await fetch(SPACES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Google Meet API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { meetingUri?: string };
  if (!data.meetingUri) {
    throw new Error("Meet space created but no meetingUri was returned");
  }
  return data.meetingUri;
}

/** Refreshes an expired/near-expiry access token. Google doesn't rotate the refresh token on use, so only the new access_token/expiry need persisting. */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_MEET_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_MEET_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
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

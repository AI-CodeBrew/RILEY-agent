/**
 * Zoom OAuth connection flow (used by the /api/oauth/zoom/* routes) — "an
 * agent connecting their own Zoom account" — plus the Node-side twins of
 * supabase/functions/_shared/zoom.ts's createZoomMeeting/
 * refreshZoomAccessToken, which the portal's manual "Add appointment" uses
 * (see lib/appointment-video-link.ts). The Deno module still covers
 * appointments Riley books on a call.
 */

const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const USERINFO_URL = "https://api.zoom.us/v2/users/me";
const MEETINGS_URL = "https://api.zoom.us/v2/users/me/meetings";

export { AUTHORIZE_URL as ZOOM_AUTHORIZE_URL };

/** Must resolve identically in /start and /callback — it's part of what Zoom validates the code exchange against. */
export function zoomRedirectUri(requestUrl: string): string {
  return new URL("/api/oauth/zoom/callback", requestUrl).toString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

function zoomBasicAuthHeader(): string {
  const clientId = requireEnv("ZOOM_CLIENT_ID");
  const clientSecret = requireEnv("ZOOM_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export interface ZoomTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Exchanges the authorization code from Zoom's redirect for tokens. */
export async function exchangeZoomCode(
  code: string,
  redirectUri: string
): Promise<ZoomTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: zoomBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Zoom token exchange failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/** Creates a scheduled Zoom meeting, returns its join link. */
export async function createZoomMeeting(
  accessToken: string,
  {
    summary,
    description,
    startTimeIso,
    durationMinutes,
    timezone,
  }: {
    summary: string;
    description?: string;
    startTimeIso: string;
    durationMinutes: number;
    timezone: string;
  }
): Promise<string> {
  const res = await fetch(MEETINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: summary,
      agenda: description,
      type: 2, // scheduled meeting
      start_time: startTimeIso,
      duration: durationMinutes,
      timezone,
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Zoom API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { join_url?: string };
  if (!data.join_url) {
    throw new Error("Zoom meeting created but no join_url was returned");
  }
  return data.join_url;
}

/** Refreshes an expired/near-expiry access token. Zoom rotates the refresh token on every use and invalidates the old one — the returned refresh_token must be persisted too. */
export async function refreshZoomAccessToken(refreshToken: string): Promise<ZoomTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: zoomBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Zoom token refresh failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/** The connected Zoom account's email, for display on the Settings page. */
export async function getZoomAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

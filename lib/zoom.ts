/**
 * Zoom OAuth connection flow (used by the /api/oauth/zoom/* routes) —
 * separate from supabase/functions/_shared/zoom.ts, which is the Deno-side
 * module that actually creates a Zoom meeting at booking time. This file
 * only handles "an agent connecting their own Zoom account."
 */

const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const USERINFO_URL = "https://api.zoom.us/v2/users/me";

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

/** The connected Zoom account's email, for display on the Settings page. */
export async function getZoomAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

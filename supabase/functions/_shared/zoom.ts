// Deno-side Zoom integration — creates the actual meeting at booking time
// and refreshes an agent's access token when it's near expiry. The OAuth
// *connection* flow (an agent authorizing their account) lives in the
// Next.js app instead (lib/zoom.ts, app/api/oauth/zoom/*) — this file only
// runs from book-appointment, once tokens already exist.

const TOKEN_URL = "https://zoom.us/oauth/token";
const MEETINGS_URL = "https://api.zoom.us/v2/users/me/meetings";

interface ZoomMeeting {
  joinUrl: string;
  meetingId: number;
}

function zoomBasicAuthHeader(): string {
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET not configured");
  }
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
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
): Promise<ZoomMeeting> {
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

  const data = await res.json();
  const joinUrl = data.join_url as string | undefined;
  if (!joinUrl) {
    throw new Error("Zoom meeting created but no join_url was returned");
  }

  return { joinUrl, meetingId: data.id };
}

/**
 * Refreshes an expired/near-expiry access token. Unlike Google, Zoom
 * rotates the refresh token on every use and invalidates the old one — the
 * caller must persist the returned refresh_token, not just the access_token.
 */
export async function refreshZoomAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
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

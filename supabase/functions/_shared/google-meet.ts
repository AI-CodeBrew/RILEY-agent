// Deno-side Google Meet integration — creates a Meet space via the Meet
// REST API at booking time, and refreshes an agent's access token when
// it's near expiry. The OAuth *connection* flow (an agent authorizing
// their account) lives in the Next.js app instead (lib/google-meet.ts,
// app/api/oauth/google-meet/*) — this file only runs from book-appointment,
// once tokens already exist.
//
// Unlike the Calendar API's conferenceData trick, the Meet REST API creates
// a join link directly (no calendar event as a side effect). A "space" is
// just a joinable room, not tied to a start/end time — same as Zoom's
// join_before_host: true setting we already use, the link just works
// whenever the customer clicks it.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SPACES_URL = "https://meet.googleapis.com/v2/spaces";

interface GoogleMeetMeeting {
  joinUrl: string;
  meetingCode: string;
}

function googleClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("GOOGLE_MEET_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_MEET_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_MEET_CLIENT_ID/GOOGLE_MEET_CLIENT_SECRET not configured");
  }
  return { clientId, clientSecret };
}

/** Creates a Google Meet space via the Meet REST API, returns its join link. */
export async function createGoogleMeetMeeting(accessToken: string): Promise<GoogleMeetMeeting> {
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

  const data = await res.json();
  const joinUrl = data.meetingUri as string | undefined;
  if (!joinUrl) {
    throw new Error("Meet space created but no meetingUri was returned");
  }

  return { joinUrl, meetingCode: data.meetingCode };
}

/**
 * Refreshes an expired/near-expiry access token. Unlike Zoom, Google does
 * not rotate the refresh token on use — the caller keeps the existing
 * refresh_token and only needs to persist the new access_token/expiry.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = googleClientCredentials();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

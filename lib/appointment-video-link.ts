import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { createZoomMeeting, refreshZoomAccessToken } from "@/lib/zoom";
import { createGoogleMeetMeeting, refreshGoogleAccessToken } from "@/lib/google-meet";

/** Refresh a token this close to its expiry rather than risk it lapsing mid-request. */
const REFRESH_MARGIN_MS = 5 * 60_000;

function needsRefresh(expiresAt: string | null) {
  return (expiresAt ? new Date(expiresAt).getTime() : 0) < Date.now() + REFRESH_MARGIN_MS;
}

/**
 * Join link for an appointment added by hand in the portal, from whichever
 * video provider the agent has connected — the Node-side twin of
 * createLocalVideoLink in the book-appointment Edge Function, so a manual
 * appointment gets the same Zoom/Google Meet link one Riley booked would.
 * Best-effort in the same way: no provider connected, or any API failure,
 * returns null and the appointment is saved without a link.
 */
export async function createAgentVideoLink(
  agentId: string,
  {
    startTimeIso,
    durationMinutes,
    summary,
    description,
  }: {
    startTimeIso: string;
    durationMinutes: number;
    summary: string;
    description?: string;
  }
): Promise<string | null> {
  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select(
      "timezone, video_provider, zoom_access_token, zoom_refresh_token, zoom_token_expires_at, google_access_token, google_refresh_token, google_token_expires_at"
    )
    .eq("id", agentId)
    .single();
  if (!agent) return null;

  if (agent.video_provider === "zoom" && agent.zoom_access_token) {
    try {
      let accessToken = (await decryptToken(agent.zoom_access_token))!;

      if (needsRefresh(agent.zoom_token_expires_at)) {
        if (!agent.zoom_refresh_token) throw new Error("no zoom_refresh_token on file");
        const refreshed = await refreshZoomAccessToken(
          (await decryptToken(agent.zoom_refresh_token))!
        );
        accessToken = refreshed.access_token;
        await supabaseAdmin
          .from("sales_agents")
          .update({
            zoom_access_token: await encryptToken(refreshed.access_token),
            zoom_refresh_token: await encryptToken(refreshed.refresh_token),
            zoom_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq("id", agentId);
      }

      return await createZoomMeeting(accessToken, {
        summary,
        description,
        startTimeIso,
        durationMinutes,
        timezone: agent.timezone,
      });
    } catch (err) {
      console.warn("appointments: could not create Zoom link", err);
      return null;
    }
  }

  if (agent.video_provider === "google_meet" && agent.google_access_token) {
    try {
      let accessToken = (await decryptToken(agent.google_access_token))!;

      if (needsRefresh(agent.google_token_expires_at)) {
        if (!agent.google_refresh_token) throw new Error("no google_refresh_token on file");
        const refreshed = await refreshGoogleAccessToken(
          (await decryptToken(agent.google_refresh_token))!
        );
        accessToken = refreshed.access_token;
        await supabaseAdmin
          .from("sales_agents")
          .update({
            google_access_token: await encryptToken(refreshed.access_token),
            google_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq("id", agentId);
      }

      return await createGoogleMeetMeeting(accessToken);
    } catch (err) {
      console.warn("appointments: could not create Google Meet link", err);
      return null;
    }
  }

  return null;
}

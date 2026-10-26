/**
 * Google Calendar as an agent's booking calendar — the OAuth connection
 * flow (app/api/oauth/google-calendar/*), the calendar picker in
 * Settings, and the Node-side event writes the portal makes
 * when an appointment is added, rescheduled or canceled by hand. The Deno
 * twin, supabase/functions/_shared/google-calendar.ts, covers availability
 * and the bookings Riley makes on a call.
 *
 * Uses the same Google OAuth client as Google Meet/Sheets
 * (GOOGLE_MEET_CLIENT_ID/SECRET) — only the scopes and redirect URI differ —
 * so the code exchange and token refresh are shared with lib/google-meet.ts.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { refreshGoogleAccessToken } from "@/lib/google-meet";
import type { GoogleCalendarConnection } from "@/types/database";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/**
 * events: create/move/delete Riley's bookings and read the availability calendar.
 * freebusy: the agent's busy times. calendarlist.readonly: the picker.
 * app.created: lets us create the "Riley Availability" calendar for them.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** The calendar we offer to create for agents who don't have one set aside yet. */
export const AVAILABILITY_CALENDAR_NAME = "Riley Availability";

/** Must resolve identically in /start and /callback — it's part of what Google validates the code exchange against. */
export function googleCalendarRedirectUri(requestUrl: string): string {
  return new URL("/api/oauth/google-calendar/callback", requestUrl).toString();
}

/** Refresh a token this close to its expiry rather than risk it lapsing mid-request. */
const REFRESH_MARGIN_MS = 5 * 60_000;

async function calendarFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar API error ${res.status} on ${path}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * A usable access token for this agent's Google Calendar connection,
 * refreshed (and the new one persisted) when it's near expiry. Null when
 * the agent hasn't connected Google Calendar.
 */
export async function getGoogleCalendarAccess(
  agentId: string
): Promise<{ accessToken: string; connection: GoogleCalendarConnection } | null> {
  const { data: connection } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!connection?.google_access_token || !connection.google_refresh_token) return null;

  const expiresAt = connection.google_token_expires_at
    ? new Date(connection.google_token_expires_at).getTime()
    : 0;
  if (expiresAt >= Date.now() + REFRESH_MARGIN_MS) {
    return { accessToken: (await decryptToken(connection.google_access_token))!, connection };
  }

  const refreshed = await refreshGoogleAccessToken(
    (await decryptToken(connection.google_refresh_token))!
  );
  await supabaseAdmin
    .from("google_calendar_connections")
    .update({
      google_access_token: await encryptToken(refreshed.access_token),
      google_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);
  return { accessToken: refreshed.access_token, connection };
}

export interface GoogleCalendarListEntry {
  id: string;
  name: string;
  primary: boolean;
  /** Only calendars the agent can write to can hold availability blocks or bookings. */
  writable: boolean;
}

/** Every calendar on the agent's Google calendar list, primary first. */
export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const data = await calendarFetch<{
    items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string }[];
  }>(accessToken, "/users/me/calendarList?minAccessRole=reader&maxResults=250");

  return (data.items ?? [])
    .map((item) => ({
      id: item.id,
      name: item.summaryOverride || item.summary || item.id,
      primary: Boolean(item.primary),
      writable: item.accessRole === "owner" || item.accessRole === "writer",
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/** Creates the agent's "Riley Availability" calendar, in their own time zone. */
export async function createAvailabilityCalendar(
  accessToken: string,
  timeZone: string
): Promise<{ id: string; name: string }> {
  const data = await calendarFetch<{ id: string; summary: string }>(accessToken, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: AVAILABILITY_CALENDAR_NAME,
      description:
        "Add events here for the times you're free to take meetings. Riley only offers customers times inside these blocks that don't clash with your other calendars.",
      timeZone,
    }),
  });
  return { id: data.id, name: data.summary };
}

export interface GoogleEventInput {
  startTimeIso: string;
  durationMinutes: number;
  timeZone: string;
  summary: string;
  description?: string;
  attendeeEmail?: string;
  /** A Zoom (or pasted) link to put on the event. Without one, Google attaches a Meet link of its own. */
  videoLink?: string | null;
}

function eventTimes(startTimeIso: string, durationMinutes: number, timeZone: string) {
  const start = new Date(startTimeIso);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
}

/**
 * Creates the booking on the agent's Google Calendar. sendUpdates=all makes
 * Google email the customer an invite (when we have their email). Returns
 * the event id and the join link: the videoLink passed in, else the Meet
 * link Google generated.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleEventInput
): Promise<{ eventId: string; meetingLink: string | null }> {
  const withMeet = !input.videoLink;
  const description = [input.description, input.videoLink ? `Join: ${input.videoLink}` : null]
    .filter(Boolean)
    .join("\n\n");

  const event = await calendarFetch<{
    id: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all${withMeet ? "&conferenceDataVersion=1" : ""}`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: description || undefined,
        location: input.videoLink || undefined,
        ...eventTimes(input.startTimeIso, input.durationMinutes, input.timeZone),
        attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
        conferenceData: withMeet
          ? {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      }),
    }
  );

  const meetLink =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ??
    null;
  return { eventId: event.id, meetingLink: input.videoLink || meetLink };
}

/** Moves an existing booking to a new time; Google emails attendees the update. */
export async function moveGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  { startTimeIso, durationMinutes, timeZone }: Pick<GoogleEventInput, "startTimeIso" | "durationMinutes" | "timeZone">
) {
  await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "PATCH", body: JSON.stringify(eventTimes(startTimeIso, durationMinutes, timeZone)) }
  );
}

/** Deletes a booking; Google emails attendees the cancellation. Already-gone events are fine. */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
) {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar API error ${res.status} deleting event: ${await res.text()}`);
  }
}

/**
 * Best-effort sync of a portal change to the Google event behind an
 * appointment. Never throws — returns a warning for the UI instead, same
 * as the Calendly cancellation: a stale Google event is better than a
 * portal change that silently didn't save.
 */
export async function syncAppointmentToGoogle(
  appointment: {
    id: string;
    agent_id: string | null;
    google_event_id: string | null;
    google_calendar_id: string | null;
  },
  change:
    | { type: "cancel" }
    | { type: "move"; startTimeIso: string; durationMinutes: number }
): Promise<string | null> {
  if (!appointment.google_event_id || !appointment.agent_id) return null;

  try {
    const access = await getGoogleCalendarAccess(appointment.agent_id);
    if (!access) {
      return "Google Calendar isn't connected anymore — update this event in Google Calendar yourself.";
    }
    const calendarId = appointment.google_calendar_id ?? access.connection.booking_calendar_id;

    if (change.type === "cancel") {
      await deleteGoogleCalendarEvent(access.accessToken, calendarId, appointment.google_event_id);
    } else {
      const { data: agent } = await supabaseAdmin
        .from("sales_agents")
        .select("timezone")
        .eq("id", appointment.agent_id)
        .maybeSingle();
      await moveGoogleCalendarEvent(access.accessToken, calendarId, appointment.google_event_id, {
        startTimeIso: change.startTimeIso,
        durationMinutes: change.durationMinutes,
        timeZone: agent?.timezone ?? "UTC",
      });
    }
    return null;
  } catch (err) {
    console.error(`Google Calendar sync failed for appointment ${appointment.id}:`, err);
    return change.type === "cancel"
      ? "Canceled here, but Google Calendar rejected the cancellation — delete it from Google Calendar too."
      : "Saved here, but Google Calendar rejected the new time — move it in Google Calendar too.";
  }
}

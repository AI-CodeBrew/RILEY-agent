// Deno-side Google Calendar integration — Google Calendar mode's
// availability (check-agent-availability) and the bookings Riley writes
// back (book-appointment, cancel-appointment-row). The OAuth connection and
// calendar picker live in the Next.js app (lib/google-calendar.ts,
// app/api/oauth/google-calendar/*) — this file only runs once tokens exist.
//
// How availability works in this mode: the agent keeps a dedicated Google
// calendar (e.g. "Riley Availability") whose events mark the blocks they're
// free to take meetings. Those blocks are cut into meeting-length slots,
// then anything overlapping a busy time on the agent's other calendars
// (freeBusy API) is dropped. Agents who haven't picked an availability
// calendar yet fall back to their weekly hours on Calendar → Availability,
// still minus their Google busy times.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import { decryptToken, encryptToken } from "./token-crypto.ts";
import { refreshGoogleAccessToken } from "./google-meet.ts";
import { matchAvailableSlot } from "./appointment-buffer.ts";
import { type AvailabilityHourRow, generateCandidateSlots } from "./local-availability.ts";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const REFRESH_MARGIN_MS = 5 * 60_000;

export type CalendarMode = "crm" | "calendly" | "google";

/**
 * Which calendar an agent books on. sales_agents.calendar_provider is the
 * explicit choice; null keeps the original inference (weekly hours → crm,
 * otherwise calendly) for agents who never picked one.
 */
export function resolveCalendarMode(
  calendarProvider: string | null | undefined,
  hasWeeklyHours: boolean
): CalendarMode {
  if (calendarProvider === "crm" || calendarProvider === "calendly" || calendarProvider === "google") {
    return calendarProvider;
  }
  return hasWeeklyHours ? "crm" : "calendly";
}

export interface GoogleCalendarConnectionRow {
  agent_id: string;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  availability_calendar_id: string | null;
  busy_calendar_ids: string[] | null;
  booking_calendar_id: string;
}

/** The agent's connection plus a usable access token (refreshed and persisted when near expiry), or null if not connected. */
export async function getGoogleCalendarAccess(
  agentId: string
): Promise<{ accessToken: string; connection: GoogleCalendarConnectionRow } | null> {
  const supabase = getSupabaseAdmin();
  const { data: connection } = await supabase
    .from("google_calendar_connections")
    .select(
      "agent_id, google_access_token, google_refresh_token, google_token_expires_at, availability_calendar_id, busy_calendar_ids, booking_calendar_id"
    )
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
  await supabase
    .from("google_calendar_connections")
    .update({
      google_access_token: await encryptToken(refreshed.access_token),
      google_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);
  return { accessToken: refreshed.access_token, connection };
}

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
  return res.json();
}

interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * The agent's free blocks: every timed event on their availability calendar
 * in [start, end). Recurring events come back expanded (singleEvents=true),
 * so a weekly "Available 10–1" is one block per day. All-day events are
 * skipped — they're usually holidays or notes, not bookable hours.
 */
async function listAvailabilityWindows(
  accessToken: string,
  calendarId: string,
  start: Date,
  end: Date
): Promise<TimeRange[]> {
  const windows: TimeRange[] = [];
  let pageToken: string | undefined;

  // Bounded: 35 days of blocks fits in a page or two; the guard just stops a runaway loop.
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await calendarFetch<{
      items?: { status?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[];
      nextPageToken?: string;
    }>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);

    for (const item of data.items ?? []) {
      if (item.status === "cancelled" || !item.start?.dateTime || !item.end?.dateTime) continue;
      windows.push({
        startMs: new Date(item.start.dateTime).getTime(),
        endMs: new Date(item.end.dateTime).getTime(),
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return windows;
}

/** Busy time across the agent's conflict calendars. A calendar Google can't read is logged and skipped rather than failing the whole check. */
async function queryBusy(
  accessToken: string,
  calendarIds: string[],
  start: Date,
  end: Date
): Promise<TimeRange[]> {
  if (calendarIds.length === 0) return [];

  const data = await calendarFetch<{
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  }>(accessToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  const busy: TimeRange[] = [];
  for (const [id, calendar] of Object.entries(data.calendars ?? {})) {
    if (calendar.errors?.length) {
      console.warn(`google-calendar: freeBusy could not read calendar ${id}`, calendar.errors);
    }
    for (const block of calendar.busy ?? []) {
      busy.push({ startMs: new Date(block.start).getTime(), endMs: new Date(block.end).getTime() });
    }
  }
  return busy;
}

/** Cuts free blocks into back-to-back meeting-length slots inside [windowStart, windowEnd). */
function slotsFromWindows(
  windows: TimeRange[],
  windowStart: Date,
  windowEnd: Date,
  meetingMinutes: number
): { start_time: string }[] {
  const meetingMs = meetingMinutes * 60_000;
  const starts = new Set<number>();

  for (const window of windows) {
    for (let candidate = window.startMs; candidate + meetingMs <= window.endMs; candidate += meetingMs) {
      if (candidate >= windowStart.getTime() && candidate < windowEnd.getTime()) {
        starts.add(candidate);
      }
    }
  }

  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((ms) => ({ start_time: new Date(ms).toISOString() }));
}

/**
 * Google Calendar mode's equivalent of Calendly's getAvailableTimes():
 * free slots in [windowStart, windowEnd), before the usual buffer filtering
 * against our own appointments (filterSlotsWithBuffer) that every mode runs.
 */
export async function getGoogleAvailableSlots({
  accessToken,
  connection,
  hours,
  windowStart,
  windowEnd,
  agentTimezone,
  meetingMinutes,
}: {
  accessToken: string;
  connection: GoogleCalendarConnectionRow;
  /** Weekly hours — only used while no availability calendar is picked. */
  hours: AvailabilityHourRow[];
  windowStart: Date;
  windowEnd: Date;
  agentTimezone: string;
  meetingMinutes: number;
}): Promise<{ start_time: string }[]> {
  const availabilityId = connection.availability_calendar_id;
  const busyIds = (connection.busy_calendar_ids ?? ["primary"]).filter((id) => id !== availabilityId);

  const [candidates, busy] = await Promise.all([
    availabilityId
      ? listAvailabilityWindows(accessToken, availabilityId, windowStart, windowEnd).then((windows) =>
          slotsFromWindows(windows, windowStart, windowEnd, meetingMinutes)
        )
      : Promise.resolve(
          generateCandidateSlots({ hours, windowStart, windowEnd, agentTimezone, meetingMinutes })
        ),
    queryBusy(accessToken, busyIds, windowStart, windowEnd),
  ]);

  const meetingMs = meetingMinutes * 60_000;
  return candidates.filter((slot) => {
    const startMs = new Date(slot.start_time).getTime();
    const endMs = startMs + meetingMs;
    return !busy.some((block) => startMs < block.endMs && endMs > block.startMs);
  });
}

/**
 * Re-checks one requested start time against live Google data right before
 * booking — the agent may have added a meeting since the availability check.
 * Same fuzzy match the CRM and Calendly paths use.
 */
export async function findGoogleBookableSlot(
  args: Omit<Parameters<typeof getGoogleAvailableSlots>[0], "windowStart" | "windowEnd">,
  requestedStartIso: string,
  toleranceMs = 5 * 60_000
): Promise<{ start_time: string } | null> {
  const requestedMs = new Date(requestedStartIso).getTime();
  if (Number.isNaN(requestedMs)) return null;

  // Wide enough on the left to include the start of the availability block
  // the slot belongs to, so slots line up with the same grid the check used.
  const windowStart = new Date(Math.max(Date.now() + 60_000, requestedMs - 24 * 60 * 60_000));
  const windowEnd = new Date(requestedMs + args.meetingMinutes * 60_000 + toleranceMs + 60_000);
  const slots = await getGoogleAvailableSlots({ ...args, windowStart, windowEnd });
  return matchAvailableSlot(requestedStartIso, slots, toleranceMs);
}

/**
 * Writes Riley's booking onto the agent's Google Calendar. sendUpdates=all
 * makes Google email the customer an invite when we have their email. With
 * no videoLink, Google attaches a Meet link of its own (conferenceData).
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: {
    startTimeIso: string;
    durationMinutes: number;
    timeZone: string;
    summary: string;
    description?: string;
    attendeeEmail?: string;
    videoLink?: string | null;
  }
): Promise<{ eventId: string; meetingLink: string | null }> {
  const withMeet = !input.videoLink;
  const start = new Date(input.startTimeIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
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
        start: { dateTime: start.toISOString(), timeZone: input.timeZone },
        end: { dateTime: end.toISOString(), timeZone: input.timeZone },
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

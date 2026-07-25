const CALENDLY_BASE_URL = "https://api.calendly.com";

export interface CalendlyEventType {
  uri: string;
  name: string;
  slug: string;
  active: boolean;
  scheduling_url: string;
  duration: number;
}

export interface CalendlyAvailableTime {
  status: string; // "available"
  start_time: string; // ISO 8601
  scheduling_url: string;
}

async function calendlyFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${CALENDLY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendly API error ${res.status} on ${path}: ${body}`);
  }

  return res.json();
}

export async function getCurrentUser(accessToken: string) {
  const data = await calendlyFetch("/users/me", accessToken);
  return data.resource as { uri: string; scheduling_url: string; name: string };
}

/** Returns the agent's active, non-secret event types, most-used first. */
export async function listEventTypes(
  accessToken: string,
  userUri: string
): Promise<CalendlyEventType[]> {
  const data = await calendlyFetch(
    `/event_types?user=${encodeURIComponent(userUri)}&active=true&sort=name:asc`,
    accessToken
  );
  return data.collection as CalendlyEventType[];
}

/**
 * Calendly's `event_type_available_times` endpoint caps the query window at
 * 7 days, so callers should page in 7-day chunks for anything further out.
 */
export async function getAvailableTimes(
  accessToken: string,
  eventTypeUri: string,
  startTime: Date,
  endTime: Date
): Promise<CalendlyAvailableTime[]> {
  const params = new URLSearchParams({
    event_type: eventTypeUri,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
  });
  const data = await calendlyFetch(`/event_type_available_times?${params}`, accessToken);
  return data.collection as CalendlyAvailableTime[];
}

/**
 * Calendly's public API has no endpoint to create an invitee/booking
 * headlessly — booking always happens through a Calendly-hosted page. The
 * closest we can get server-side is a single-use scheduling link scoped to
 * one event type, pre-filled with the customer's name/email, good for one
 * booking only. See supabase/functions/book-appointment/index.ts for how
 * this is used and the confirmation-webhook follow-up it implies.
 */
export async function createSingleUseSchedulingLink(
  accessToken: string,
  eventTypeUri: string
): Promise<{ booking_url: string }> {
  const data = await calendlyFetch("/scheduling_links", accessToken, {
    method: "POST",
    body: JSON.stringify({
      max_event_count: 1,
      owner: eventTypeUri,
      owner_type: "EventType",
    }),
  });
  return data.resource as { booking_url: string };
}

export function buildPrefilledBookingUrl(
  bookingUrl: string,
  invitee: { name: string; email?: string }
): string {
  const url = new URL(bookingUrl);
  url.searchParams.set("name", invitee.name);
  if (invitee.email) url.searchParams.set("email", invitee.email);
  return url.toString();
}

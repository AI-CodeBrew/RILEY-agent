import { getAvailableTimes } from "./calendly.ts";
import { matchAvailableSlot } from "./appointment-buffer.ts";

const CALENDLY_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Same forward-looking window check-agent-availability uses, then fuzzy-match the slot. */
export async function findBookableSlot(
  accessToken: string,
  eventTypeUri: string,
  requestedStartIso: string,
  toleranceMs = 5 * 60_000
): Promise<{ start_time: string } | null> {
  const requestedMs = new Date(requestedStartIso).getTime();

  const windowStart = new Date(Date.now() + 60_000);
  let windowEnd = new Date(windowStart.getTime() + CALENDLY_MAX_WINDOW_MS);

  let availableTimes = await getAvailableTimes(
    accessToken,
    eventTypeUri,
    windowStart,
    windowEnd
  );
  let matched = matchAvailableSlot(requestedStartIso, availableTimes, toleranceMs);
  if (matched) return matched;

  if (!Number.isNaN(requestedMs) && requestedMs > windowEnd.getTime()) {
    const laterStart = new Date(requestedMs - 60 * 60_000);
    windowEnd = new Date(laterStart.getTime() + CALENDLY_MAX_WINDOW_MS);
    availableTimes = await getAvailableTimes(
      accessToken,
      eventTypeUri,
      laterStart,
      windowEnd
    );
    matched = matchAvailableSlot(requestedStartIso, availableTimes, toleranceMs);
  }

  return matched;
}

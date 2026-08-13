// Computes when an auto-retry call should happen: `delayMinutes` after now,
// clamped into the agent's local calling window (`windowStart`/`windowEnd`,
// "HH:MM" or "HH:MM:SS", interpreted in `timezone`). A candidate that lands
// before today's window snaps to today's window start; one that lands at or
// after today's window end snaps to tomorrow's window start instead of
// spilling into the middle of the night — this is what makes retries pick
// back up "next day" with no separate day-rollover logic anywhere else.

function parseTimeOfDay(value: string): [number, number] {
  const [h, m] = value.split(":");
  return [Number(h), Number(m)];
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** UTC instant whose wall-clock reading in `timeZone` is the given y/m/d h:m:s. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const zonedReading = zonedParts(new Date(targetAsUtc), timeZone);
  const zonedReadingAsUtc = Date.UTC(
    zonedReading.year,
    zonedReading.month - 1,
    zonedReading.day,
    zonedReading.hour,
    zonedReading.minute,
    zonedReading.second
  );
  const offset = zonedReadingAsUtc - targetAsUtc;
  return new Date(targetAsUtc - offset);
}

/** "HH:MM" reading of an absolute instant in `timeZone` — used to turn a
 * campaign's one-time window_start/window_end into the "HH:MM" pair
 * computeNextRetryAt expects, so that window is treated as a recurring
 * daily slot rather than a single dated range. */
export function timeOfDayInZone(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function computeNextRetryAt(params: {
  now: Date;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  delayMinutes: number;
}): Date {
  const { now, timezone, windowStart, windowEnd, delayMinutes } = params;
  const candidate = new Date(now.getTime() + delayMinutes * 60_000);

  const [startHour, startMinute] = parseTimeOfDay(windowStart);
  const [endHour, endMinute] = parseTimeOfDay(windowEnd);
  const startOfDayMinutes = startHour * 60 + startMinute;
  const endOfDayMinutes = endHour * 60 + endMinute;

  const zoned = zonedParts(candidate, timezone);
  const candidateMinutes = zoned.hour * 60 + zoned.minute;

  if (candidateMinutes < startOfDayMinutes) {
    return zonedTimeToUtc(zoned.year, zoned.month, zoned.day, startHour, startMinute, 0, timezone);
  }
  if (candidateMinutes >= endOfDayMinutes) {
    // Date.UTC normalizes day overflow, so `zoned.day + 1` correctly rolls
    // into the next month/year at a month/year boundary.
    return zonedTimeToUtc(zoned.year, zoned.month, zoned.day + 1, startHour, startMinute, 0, timezone);
  }
  return candidate;
}

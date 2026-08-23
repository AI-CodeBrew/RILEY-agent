// Deno-runtime mirror of lib/campaign-schedule.ts — same implementation,
// duplicated rather than imported because Edge Functions can't reach into
// lib/ (see resolve-call-outcome.ts's own duplicated helpers for the same
// established pattern in this repo). Keep the two files in sync.

export interface CampaignWindow {
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
}

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

/** "YYYY-MM-DD" reading of an instant in `timeZone`, comparable to a bare date column. */
export function zonedDateString(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function usableWindows(windows: CampaignWindow[]): CampaignWindow[] {
  return windows.filter((w) => w.end_time > w.start_time);
}

/** True if `date`'s calendar day in `timezone` falls within [startDate, endDate] (both "YYYY-MM-DD"). */
export function isWithinDateRange(
  date: Date,
  timezone: string,
  startDate: string,
  endDate: string
): boolean {
  const d = zonedDateString(date, timezone);
  return d >= startDate && d <= endDate;
}

/** True if `now`, read in `timezone`, falls inside any window's time-of-day range. Windows apply uniformly to every date — no day-of-week filtering. */
export function isWithinAnyWindow(windows: CampaignWindow[], now: Date, timezone: string): boolean {
  const zoned = zonedParts(now, timezone);
  const nowMinutes = zoned.hour * 60 + zoned.minute;

  return usableWindows(windows).some((window) => {
    const [startHour, startMinute] = parseTimeOfDay(window.start_time);
    const [endHour, endMinute] = parseTimeOfDay(window.end_time);
    const startOfDayMinutes = startHour * 60 + startMinute;
    const endOfDayMinutes = endHour * 60 + endMinute;
    return nowMinutes >= startOfDayMinutes && nowMinutes < endOfDayMinutes;
  });
}

/** The earliest instant at or after `from` when some window begins — today's next one, or tomorrow's earliest if today's have all passed. Null when there are no usable windows at all. */
export function nextWindowStart(
  windows: CampaignWindow[],
  from: Date,
  timezone: string
): Date | null {
  const usable = usableWindows(windows);
  if (usable.length === 0) return null;

  const zoned = zonedParts(from, timezone);
  let best: Date | null = null;

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const window of usable) {
      const [startHour, startMinute] = parseTimeOfDay(window.start_time);
      const candidate = zonedTimeToUtc(
        zoned.year,
        zoned.month,
        zoned.day + dayOffset,
        startHour,
        startMinute,
        0,
        timezone
      );
      if (candidate < from) continue;
      if (!best || candidate < best) best = candidate;
    }
    if (best) return best;
  }

  return best;
}

/** When an auto-retry call should happen: `delayMinutes` after `now`, clamped
 * into the originating campaign's windows and bounded by its end_date.
 * Returns null when there are no usable windows, or the next available slot
 * would fall after the campaign's date range ends. */
export function computeNextRetryAt(params: {
  now: Date;
  timezone: string;
  windows: CampaignWindow[];
  endDate: string;
  delayMinutes: number;
}): Date | null {
  const { now, timezone, windows, endDate, delayMinutes } = params;
  const usable = usableWindows(windows);
  if (usable.length === 0) return null;

  const candidate = new Date(now.getTime() + delayMinutes * 60_000);
  if (isWithinAnyWindow(usable, candidate, timezone)) {
    return zonedDateString(candidate, timezone) <= endDate ? candidate : null;
  }

  const next = nextWindowStart(usable, candidate, timezone);
  if (!next) return null;
  return zonedDateString(next, timezone) <= endDate ? next : null;
}

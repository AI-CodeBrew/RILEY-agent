/**
 * Turns the "from"/"to" query params used by Calls, Appointments, and Notes
 * into UTC instant bounds for a `.gte()/.lt()` query, reading the date
 * strings in the viewer's own timezone so "Sep 3" means Sep 3 in their zone,
 * not UTC. A separate small copy of the zoned-date math in
 * app/(portal)/calendar/calendar-dates.ts, which is scoped to the calendar
 * grid per its own header comment — same reasoning as that file's own
 * decision not to share with lib/campaign-schedule.ts.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/** UTC instant whose wall-clock reading in `timeZone` is midnight on `dateStr` ("YYYY-MM-DD"). */
function dayStartUtc(dateStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const zoned = zonedParts(new Date(targetAsUtc), timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
  const offset = zonedAsUtc - targetAsUtc;
  return new Date(targetAsUtc - offset);
}

/** `dateStr` shifted by `days` calendar days — pure Y/M/D arithmetic, done at UTC noon to sidestep DST edges. */
function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, 12) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRangeBounds {
  /** Inclusive lower bound as an ISO instant, or null if `from` was missing/invalid. */
  startUtc: string | null;
  /** Exclusive upper bound as an ISO instant — start of the day *after* `to` — or null. */
  endUtc: string | null;
}

export function parseDateRangeFilter(
  from: string | undefined,
  to: string | undefined,
  timeZone: string
): DateRangeBounds {
  const startUtc = from && DATE_RE.test(from) ? dayStartUtc(from, timeZone).toISOString() : null;
  const endUtc = to && DATE_RE.test(to) ? dayStartUtc(addDays(to, 1), timeZone).toISOString() : null;
  return { startUtc, endUtc };
}

/**
 * Zoned date math for the Calendar module. Framework-free (no "use client")
 * so the same functions compute the server-side query range (calendar/
 * page.tsx) and the client-side grid layout (WeekGrid/DayGrid) — the two
 * have to agree on what "today" and "this week" mean in the agent's
 * timezone, or the grid and the fetched rows would drift apart.
 *
 * The zoned-instant algorithm mirrors lib/campaign-schedule.ts (not
 * imported from it — that file is about campaign dial windows, this one is
 * about calendar-grid dates; keeping them separate avoids coupling two
 * unrelated features to one shared module for a ~15-line algorithm).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
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

/** "YYYY-MM-DD" reading of an instant in `timeZone`. */
export function zonedDateString(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** UTC instant whose wall-clock reading in `timeZone` is midnight on `dateStr` ("YYYY-MM-DD"). */
export function dayStartUtc(dateStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const zoned = zonedParts(new Date(targetAsUtc), timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
  const offset = zonedAsUtc - targetAsUtc;
  return new Date(targetAsUtc - offset);
}

/** `dateStr` shifted by `days` calendar days — pure Y/M/D arithmetic, done at UTC noon to sidestep DST edges. */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, 12) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** `dateStr` shifted by whole calendar months, always normalized to day 01 — used for Month view Prev/Next, where the day-of-month is irrelevant to which month is shown. */
export function addMonths(dateStr: string, months: number): string {
  const [year, month] = dateStr.split("-").map(Number);
  const index = (year * 12 + (month - 1)) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  return `${newYear}-${pad(newMonth)}-01`;
}

/** 0 (Sun) – 6 (Sat) for `dateStr`, independent of timezone (a calendar date's weekday never changes). */
export function weekdayIndex(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

/** The Sunday on or before `dateStr`. */
export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -weekdayIndex(dateStr));
}

/** The Sunday that starts the 6-week (42-day) grid containing `dateStr`'s month. */
export function startOfMonthGrid(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return startOfWeek(`${year}-${pad(month)}-01`);
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Which of the calendar module's grid layouts is showing — used by grid/page.tsx and CalendarShell. */
export type CalendarView = "month" | "week" | "day";

function clockLabel(hour24: number, minute: number): { label: string; period: "am" | "pm" } {
  const period = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const label = minute === 0 ? `${hour12}` : `${hour12}:${pad(minute)}`;
  return { label, period };
}

/** "9 – 9:30am" / "11:45am – 12:15pm" — the Meetings list's compact time range, in `timeZone`. */
export function formatTimeRange(
  startIso: string,
  durationMinutes: number,
  timeZone: string
): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const startParts = zonedParts(start, timeZone);
  const endParts = zonedParts(end, timeZone);
  const from = clockLabel(startParts.hour, startParts.minute);
  const to = clockLabel(endParts.hour, endParts.minute);
  if (from.period === to.period) {
    return `${from.label} – ${to.label}${to.period}`;
  }
  return `${from.label}${from.period} – ${to.label}${to.period}`;
}

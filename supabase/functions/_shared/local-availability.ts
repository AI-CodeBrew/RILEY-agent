// Local (non-Calendly) availability computation for agents who've set weekly
// hours on the portal's Calendar → Availability page instead of connecting
// Calendly. See supabase/migrations/00000000000032_agent_availability_hours.sql
// for why this table exists and what it's for.
//
// The date-math here is a Deno-native port of app/(portal)/calendar/calendar-dates.ts
// (that file can't be imported directly — edge functions are a separate Deno
// deployable with no access to the Next.js app) — same pattern already used by
// _shared/canada-timezones.ts, which is a kept-in-sync copy of lib/canada-timezones.ts.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import { matchAvailableSlot } from "./appointment-buffer.ts";

export interface AvailabilityHourRow {
  /** 0 (Sun) – 6 (Sat). */
  weekday: number;
  /** "HH:MM:SS" (Postgres `time`). */
  start_time: string;
  end_time: string;
}

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

function zonedDateString(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** UTC instant whose wall-clock reading in `timeZone` is `hour:minute` on `dateStr`. */
function localTimeToUtc(dateStr: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const zoned = zonedParts(new Date(targetAsUtc), timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
  const offset = zonedAsUtc - targetAsUtc;
  return new Date(targetAsUtc - offset);
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, 12) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function weekdayIndexOf(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  return { hour: Number(h), minute: Number(m) };
}

/** True if this agent has any local weekly hours saved — the hybrid mode switch both edge functions branch on. */
export async function hasLocalAvailability(agentId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("agent_availability_hours")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  return (count ?? 0) > 0;
}

export async function getAgentAvailabilityHours(agentId: string): Promise<AvailabilityHourRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_availability_hours")
    .select("weekday, start_time, end_time")
    .eq("agent_id", agentId);
  return data ?? [];
}

/**
 * Walks each calendar day in [windowStart, windowEnd) in the agent's own
 * timezone, matches that day's weekday against `hours`, and steps through
 * each working-hours block in `slotIntervalMinutes` increments — the local
 * equivalent of Calendly's getAvailableTimes(). Buffer/existing-appointment
 * filtering happens afterward via appointment-buffer.ts's
 * filterSlotsWithBuffer(), same as the Calendly path.
 */
export function generateCandidateSlots({
  hours,
  windowStart,
  windowEnd,
  agentTimezone,
  meetingMinutes,
  slotIntervalMinutes = meetingMinutes,
}: {
  hours: AvailabilityHourRow[];
  windowStart: Date;
  windowEnd: Date;
  agentTimezone: string;
  meetingMinutes: number;
  slotIntervalMinutes?: number;
}): { start_time: string }[] {
  const hoursByWeekday = new Map<number, AvailabilityHourRow[]>();
  for (const row of hours) {
    const list = hoursByWeekday.get(row.weekday);
    if (list) list.push(row);
    else hoursByWeekday.set(row.weekday, [row]);
  }

  const slots: { start_time: string }[] = [];
  const stepMs = slotIntervalMinutes * 60_000;
  const meetingMs = meetingMinutes * 60_000;
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  let dayStr = zonedDateString(windowStart, agentTimezone);
  const endDayStr = zonedDateString(windowEnd, agentTimezone);

  for (let guard = 0; guard < 60; guard++) {
    const dayHours = hoursByWeekday.get(weekdayIndexOf(dayStr)) ?? [];
    for (const block of dayHours) {
      const blockStartParts = parseTimeOfDay(block.start_time);
      const blockEndParts = parseTimeOfDay(block.end_time);
      const blockStartMs = localTimeToUtc(
        dayStr,
        blockStartParts.hour,
        blockStartParts.minute,
        agentTimezone
      ).getTime();
      const blockEndMs = localTimeToUtc(
        dayStr,
        blockEndParts.hour,
        blockEndParts.minute,
        agentTimezone
      ).getTime();

      let candidateMs = blockStartMs;
      while (candidateMs + meetingMs <= blockEndMs) {
        if (candidateMs >= windowStartMs && candidateMs < windowEndMs) {
          slots.push({ start_time: new Date(candidateMs).toISOString() });
        }
        candidateMs += stepMs;
      }
    }

    if (dayStr >= endDayStr) break;
    dayStr = addDaysToDateString(dayStr, 1);
  }

  slots.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  return slots;
}

/**
 * Local equivalent of calendly-slots.ts's findBookableSlot — confirms a
 * requested start time genuinely falls inside the agent's working hours,
 * regenerating a tight window of candidates around just that time and
 * fuzzy-matching (reuses the same matchAvailableSlot helper the Calendly
 * path uses). No external re-fetch needed, since agent_availability_hours
 * is already the source of truth being checked against.
 */
export function findLocalBookableSlot(
  hours: AvailabilityHourRow[],
  agentTimezone: string,
  requestedStartIso: string,
  meetingMinutes: number,
  toleranceMs = 5 * 60_000
): { start_time: string } | null {
  const requestedMs = new Date(requestedStartIso).getTime();
  if (Number.isNaN(requestedMs)) return null;

  const windowStart = new Date(requestedMs - toleranceMs - 60_000);
  const windowEnd = new Date(requestedMs + meetingMinutes * 60_000 + toleranceMs + 60_000);
  const candidates = generateCandidateSlots({
    hours,
    windowStart,
    windowEnd,
    agentTimezone,
    meetingMinutes,
  });
  return matchAvailableSlot(requestedStartIso, candidates, toleranceMs);
}

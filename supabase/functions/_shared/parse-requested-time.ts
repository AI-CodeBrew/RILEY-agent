// Turns the free-form `requested_time` phrase the Vapi assistant passes
// (e.g. "next Thursday", "Saturday morning Atlantic", "Saturday, September
// 19 at 11am") into a structured day/time preference check-agent-availability
// can actually act on.
//
// check-agent-availability's tool schema asks the model for an ISO 8601
// timestamp, but the assistant has no reliable notion of "today's date" in
// its own context, so in practice it can't compute "next Thursday" into an
// ISO instant — it just forwards the customer's words verbatim. This parser
// is what makes that usable without changing that contract or depending on
// the model to get it right.
//
// Deliberately no per-weekday special-casing: every weekday name is handled
// by the same generic lookup, so "Thursday" and "Saturday" get no different
// treatment than any other day.

import { addDaysToDateString, weekdayIndexOf, zonedDateString } from "./local-availability.ts";
import { CANADA_TIME_ZONES } from "./canada-timezones.ts";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export type DayPart = "morning" | "afternoon" | "evening";

/** Local-hour boundaries (24h, end-exclusive) used to filter/sort a day's slots by part of day. */
export const DAY_PART_RANGES: Record<DayPart, { fromHour: number; toHour: number }> = {
  morning: { fromHour: 0, toHour: 12 },
  afternoon: { fromHour: 12, toHour: 17 },
  evening: { fromHour: 17, toHour: 24 },
};

export interface ParsedRequestedTime {
  /** YYYY-MM-DD (in the resolved reference zone) the customer asked about, if a specific day was identified. */
  targetDate: string | null;
  dayPart: DayPart | null;
  /** Explicit clock time mentioned alongside the day, if any (24h). Also set when `requested_time` was already a real ISO instant, from that instant's own time. */
  timeOfDay: { hour: number; minute: number } | null;
  /** IANA zone named in the phrase ("Atlantic", "Eastern", ...), if any — takes priority over the customer's stored timezone for deciding which calendar day "Thursday" refers to. */
  timezone: string | null;
}

const EMPTY: ParsedRequestedTime = {
  targetDate: null,
  dayPart: null,
  timeOfDay: null,
  timezone: null,
};

function findNamedTimezone(text: string): string | null {
  for (const zone of CANADA_TIME_ZONES) {
    if (new RegExp(`\\b${zone.label.toLowerCase()}\\b`).test(text)) return zone.iana;
  }
  return null;
}

function findDayPart(text: string): DayPart | null {
  if (/\bmorning\b/.test(text)) return "morning";
  if (/\bafternoon\b/.test(text)) return "afternoon";
  if (/\b(evening|night)\b/.test(text)) return "evening";
  return null;
}

function findClockTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const isPm = /p/i.test(match[3]);
  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;
  return { hour, minute };
}

/** Resolves an explicit "<Month> <day>" mention to the next real calendar date on/after `fromDateStr`. */
function findExplicitDate(text: string, fromDateStr: string): string | null {
  const match = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\.?\s+(\d{1,2})(st|nd|rd|th)?\b/i
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  if (day < 1 || day > 31) return null;

  const [fromYear] = fromDateStr.split("-").map(Number);
  for (const year of [fromYear, fromYear + 1]) {
    const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate >= fromDateStr) return candidate;
  }
  return null;
}

function findRelativeDayDate(text: string, fromDateStr: string): string | null {
  if (/\btoday\b/.test(text)) return fromDateStr;
  if (/\btomorrow\b/.test(text)) return addDaysToDateString(fromDateStr, 1);
  return null;
}

/**
 * Resolves a bare weekday mention ("Thursday", "next Saturday", ...) to the
 * next real calendar date strictly after `fromDateStr` — a customer naming a
 * day distinct from "today"/"right now" means an upcoming one, so this never
 * resolves to today even if today happens to be that weekday. "next" gets no
 * separate handling — in everyday use "Thursday" and "next Thursday" both
 * mean the nearest upcoming Thursday.
 */
function findWeekdayDate(text: string, fromDateStr: string): string | null {
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday === -1) return null;

  let candidate = fromDateStr;
  for (let i = 0; i < 8; i++) {
    candidate = addDaysToDateString(candidate, 1);
    if (weekdayIndexOf(candidate) === weekday) return candidate;
  }
  return null;
}

/**
 * Parses free-form scheduling language into a structured preference. Falls
 * back to a real ISO instant when the model did send one — `targetDate` and
 * `timeOfDay` are derived from it directly rather than treated as a separate
 * code path, so a well-formed ISO input and a natural-language one flow
 * through the same day-matching logic in check-agent-availability.
 */
export function parseRequestedTime(
  requestedTime: string | undefined,
  now: Date,
  referenceTimezone: string
): ParsedRequestedTime {
  if (!requestedTime || !requestedTime.trim()) return EMPTY;

  const asDate = new Date(requestedTime);
  if (!Number.isNaN(asDate.getTime())) {
    const zoneForInstant = findNamedTimezone(requestedTime.toLowerCase()) ?? referenceTimezone;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneForInstant,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(asDate);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return {
      targetDate: zonedDateString(asDate, zoneForInstant),
      dayPart: null,
      timeOfDay: { hour, minute },
      timezone: findNamedTimezone(requestedTime.toLowerCase()),
    };
  }

  const text = requestedTime.toLowerCase();
  const fromDateStr = zonedDateString(now, referenceTimezone);
  const timezone = findNamedTimezone(text);
  const dayPart = findDayPart(text);
  const timeOfDay = findClockTime(text);
  const targetDate =
    findExplicitDate(text, fromDateStr) ??
    findRelativeDayDate(text, fromDateStr) ??
    findWeekdayDate(text, fromDateStr);

  return { targetDate, dayPart, timeOfDay, timezone };
}

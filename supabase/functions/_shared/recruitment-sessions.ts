// Fixed consultation sessions for the Resume script (RECRUITMENT). Instead of
// offering open calendar slots, the assistant offers these two daily session
// times and book-appointment registers every candidate into the one they
// pick — no availability hours, no calendar free/busy, no conflict check
// against other appointments (many candidates share the same session).

import { localTimeToUtc, zonedDateString } from "./local-availability.ts";
import { parseRequestedTime } from "./parse-requested-time.ts";

/** Session start times (24h), in the candidate's own time zone. */
export const RECRUITMENT_SESSIONS = [
  { hour: 11, minute: 0, label: "11 AM" },
  { hour: 18, minute: 0, label: "6 PM" },
] as const;

/**
 * Turns the candidate's pick ("tomorrow at 11 AM", "Thursday 6pm", or an ISO
 * instant) into the session's UTC start. Returns an error string the
 * assistant can act on when the day is missing, the time isn't one of the
 * sessions, or that session has already started.
 */
export function resolveRecruitmentSession(
  requestedSession: string | undefined,
  now: Date,
  customerTimezone: string
): { start_time: string } | { error: string } {
  const sessionList = RECRUITMENT_SESSIONS.map((s) => s.label).join(" or ");
  const parsed = parseRequestedTime(requestedSession, now, customerTimezone);
  if (!parsed.targetDate) {
    return { error: `no day recognized — ask the candidate which day, then pass e.g. "tomorrow at 11 AM"` };
  }

  // "the evening one" / "morning" with no clock time still picks a session.
  const session =
    RECRUITMENT_SESSIONS.find(
      (s) => parsed.timeOfDay && s.hour === parsed.timeOfDay.hour && s.minute === parsed.timeOfDay.minute
    ) ??
    (!parsed.timeOfDay && parsed.dayPart
      ? RECRUITMENT_SESSIONS[parsed.dayPart === "morning" ? 0 : 1]
      : undefined);
  if (!session) {
    return { error: `sessions are only at ${sessionList} — ask the candidate which of those works` };
  }

  const zone = parsed.timezone ?? customerTimezone;
  const start = localTimeToUtc(parsed.targetDate, session.hour, session.minute, zone);
  if (start.getTime() <= now.getTime()) {
    const today = parsed.targetDate === zonedDateString(now, zone);
    return {
      error: today
        ? `the ${session.label} session today has already started — offer another session or another day`
        : "that day is in the past — ask the candidate for an upcoming day",
    };
  }
  return { start_time: start.toISOString() };
}

/** Formats an ISO timestamp in a given IANA zone for SMS copy — shared by
 * book-appointment (confirmation text) and send-appointment-reminders
 * (reminder text) so the two messages read consistently. */
export function formatLocalTime(scheduledAtIso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(scheduledAtIso));
  } catch {
    // Bad/unrecognized IANA zone on the row — fall back to UTC rather than
    // failing the whole message.
    return new Date(scheduledAtIso).toUTCString();
  }
}

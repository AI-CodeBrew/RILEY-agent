// Shared by the dashboard's "Call outcomes" card and its CSV export
// (app/api/calls/outcomes/export), so the file always matches the card.

/** Trailing days the dashboard reports on. */
export const DASHBOARD_WINDOW_DAYS = 7;

/** Outcomes the "Call outcomes" card lists, in display order. */
export const OUTCOME_LABELS: Record<string, string> = {
  appointment_set: "Appointment set",
  call_back_later: "Call back later",
  no_answer: "No answer",
  voicemail: "Voicemail",
  not_interested: "Not interested",
  error: "Error",
};

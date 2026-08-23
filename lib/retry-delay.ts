/** Preset delays for the Auto-Dial Settings panel's "Retry Cycle Delay"
 * field (`sales_agents.retry_cycle_delay_minutes`) — how long to wait
 * before starting another retry cycle once one exhausts its immediate
 * attempts. The delay *within* a cycle isn't a separate setting; it's
 * always `call_gap_seconds`, the same cadence used between different
 * customers — see supabase/functions/_shared/resolve-call-outcome.ts. */
export const RETRY_DELAY_OPTIONS = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
] as const;

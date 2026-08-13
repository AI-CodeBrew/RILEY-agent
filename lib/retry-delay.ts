/** Preset redial delays for follow_up/no_answer customers — shown on both
 * the AI Integration page and the Auto-dial page so an agent can set the
 * same `sales_agents.retry_delay_minutes` value from wherever they land. */
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

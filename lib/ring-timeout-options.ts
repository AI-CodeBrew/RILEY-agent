/** Ring timeout choices (sales_agents.ring_timeout_seconds); "none" = null, no auto hangup. */
export const RING_TIMEOUT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "12", label: "12 seconds (hangup ~ring+9s)" },
  { value: "13", label: "13 seconds (hangup ~ring+10s)" },
  { value: "14", label: "14 seconds (hangup ~ring+11s)" },
  { value: "15", label: "15 seconds (hangup ~ring+12s)" },
  { value: "none", label: "None (no auto hangup)" },
];


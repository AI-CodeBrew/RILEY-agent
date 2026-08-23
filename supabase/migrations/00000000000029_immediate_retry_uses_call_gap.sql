-- The delay between immediate-retry attempts within one retry cycle is no
-- longer its own setting — it now always matches call_gap_seconds (Delay
-- Between Calls), the same cadence used to dial the next different
-- customer. A same-customer immediate retry is just another call in the
-- dial loop, so it gets the same short gap rather than a separate
-- multi-minute setting. See supabase/functions/_shared/resolve-call-outcome.ts.

alter table sales_agents
  drop column if exists retry_delay_minutes;

comment on column sales_agents.call_gap_seconds is
  'Default gap between dialing different customers in a new auto-dial campaign (dial_campaigns.gap_seconds), and the delay used for immediate-retry attempts within one retry cycle (see resolve-call-outcome.ts) — see app/api/campaigns/route.ts.';

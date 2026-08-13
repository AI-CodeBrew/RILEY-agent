-- Auto-retry no longer uses a separate admin-set "calling hours" window on
-- sales_agents. Instead it reuses the window the agent already picks when
-- starting the auto-dial campaign that placed the original call
-- (dial_campaigns.window_start/window_end) — resolve-call-outcome extracts
-- that campaign's time-of-day and treats it as a recurring daily slot. See
-- supabase/functions/_shared/resolve-call-outcome.ts and retry-schedule.ts.
--
-- Consequence: auto-retry now only applies to customers dialed through an
-- auto-dial campaign — a manual one-off dial has no campaign window to
-- clamp into, so it no longer gets an automatic retry scheduled.

alter table customers
  add column if not exists retry_campaign_id uuid references dial_campaigns(id) on delete set null;

alter table sales_agents
  drop constraint if exists sales_agents_retry_window_check;

alter table sales_agents
  drop column if exists retry_window_start,
  drop column if exists retry_window_end;

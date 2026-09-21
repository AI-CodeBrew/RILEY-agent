-- Narrows ring_timeout_seconds' allowed values from (16, 30) to (10, 15).
-- The old (16, 30) constraint must be dropped before rewriting existing rows
-- to 15 — otherwise the UPDATE below violates it outright (15 isn't in the
-- old allowed set either).
alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

-- Existing agents sitting on 16 or 30 are moved to the closest surviving
-- option (15) before the tighter constraint goes on.
update sales_agents
  set ring_timeout_seconds = 15
  where ring_timeout_seconds in (16, 30);

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (ring_timeout_seconds in (10, 15));

alter table sales_agents
  alter column ring_timeout_seconds set default 15;

comment on column sales_agents.ring_timeout_seconds is
  'How long to let an outbound call ring before hanging up and treating it as no_answer. Enforced by reconcile-live-calls polling Vapi — no native ring-timeout param exists on Vapi''s call API. reconcile-live-calls polls every 4 seconds (00000000000042_tighten_reconcile_cron.sql), which is tight enough for both 10s and 15s to resolve on distinct poll ticks.';

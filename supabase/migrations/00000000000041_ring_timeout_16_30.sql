-- Narrows ring_timeout_seconds' allowed values from (30, 40, 50) to (16, 30).
-- Existing agents sitting on 40 or 50 have no equivalent left, so they're
-- moved to the closest surviving option (30) before the tighter constraint
-- goes on — otherwise this migration fails outright on any such row.
update sales_agents
  set ring_timeout_seconds = 30
  where ring_timeout_seconds in (40, 50);

alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (ring_timeout_seconds in (16, 30));

comment on column sales_agents.ring_timeout_seconds is
  'How long to let an outbound call ring before hanging up and treating it as no_answer. Enforced by reconcile-live-calls polling Vapi — no native ring-timeout param exists on Vapi''s call API. 16s only lands meaningfully tighter than 30s if the reconcile-live-calls cron interval (see 00000000000028_auto_dial_settings_and_privacy.sql) is also shortened below its current 15s — otherwise both options resolve on roughly the same poll tick.';

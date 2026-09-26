-- Cap ring timeout at 10 seconds max — unanswered outbound rings past ~16s
-- often hit fax/machine pickup and burn call charges. Options stay 9 or 10.
update sales_agents
  set ring_timeout_seconds = 10
  where ring_timeout_seconds = 15;

alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (ring_timeout_seconds in (9, 10));

alter table sales_agents
  alter column ring_timeout_seconds set default 10;

comment on column sales_agents.ring_timeout_seconds is
  'Seconds to let an unanswered outbound call ring before hanging up (9 or 10). Enforced at place-call time via Twilio hangup + reconcile backstop.';

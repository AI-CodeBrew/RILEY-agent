-- Ring ~13s then hang up — fax/machine pickup is ~16s, so dead ~2–3s early.
-- Replaces 9/10 options.
--
-- Order matters: drop the old check BEFORE updating to 13, or Postgres
-- rejects the UPDATE against sales_agents_ring_timeout_seconds_check (9, 10).

alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

update sales_agents
  set ring_timeout_seconds = 13
  where ring_timeout_seconds in (9, 10);

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (ring_timeout_seconds in (12, 13));

alter table sales_agents
  alter column ring_timeout_seconds set default 13;

comment on column sales_agents.ring_timeout_seconds is
  'Seconds of ringing before hangup (12 or 13). Hangup fires at this mark via Twilio so the call is dead ~2–3s before ~16s fax pickup.';

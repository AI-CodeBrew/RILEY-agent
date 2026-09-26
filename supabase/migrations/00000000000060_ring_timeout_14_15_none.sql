-- Ring timeout options: 12 / 13 / 14 / 15 seconds, or NULL = none (no auto hangup).
-- Hangup still fires ~3s early (14 → ring+11s, 15 → ring+12s) in app code.

alter table sales_agents
  drop constraint if exists sales_agents_ring_timeout_seconds_check;

alter table sales_agents
  alter column ring_timeout_seconds drop not null;

alter table sales_agents
  add constraint sales_agents_ring_timeout_seconds_check
    check (
      ring_timeout_seconds is null
      or ring_timeout_seconds in (12, 13, 14, 15)
    );

alter table sales_agents
  alter column ring_timeout_seconds set default 13;

comment on column sales_agents.ring_timeout_seconds is
  'Seconds of ringing before hangup (12/13/14/15), or NULL for none (no auto ring-cut). Hangup fires ~3s early via Twilio.';

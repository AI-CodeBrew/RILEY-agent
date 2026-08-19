-- Adds `sold` as a manually-settable customer status, alongside the existing
-- funnel statuses (new, not_interested, do_not_call, etc.) — see
-- 00000000000011_agent_phone_numbers.sql for the same pattern with `follow_up`.
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check
  check (status in ('new', 'call_scheduled', 'calling', 'contacted', 'appointment_set', 'follow_up', 'no_answer', 'not_interested', 'do_not_call', 'sold'));

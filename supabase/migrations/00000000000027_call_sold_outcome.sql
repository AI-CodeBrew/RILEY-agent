-- Adds `sold` as a manually-settable call outcome, so an agent can correct a
-- call's outcome from the portal (e.g. the AI classified it as
-- `appointment_set` but the customer actually bought on the call). Same
-- pattern as 00000000000026_customer_sold_status.sql for customers.status.
alter table calls drop constraint if exists calls_outcome_check;
alter table calls add constraint calls_outcome_check
  check (outcome in ('appointment_set', 'no_answer', 'voicemail', 'not_interested', 'call_back_later', 'error', 'sold') or outcome is null);

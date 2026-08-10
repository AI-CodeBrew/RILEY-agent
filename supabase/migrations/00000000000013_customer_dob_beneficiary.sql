-- Identity-verification fields for the outbound review script.
--
-- Abby confirms date of birth and beneficiary name near the top of the call
-- as a trust step (see vapi/assistant.json). Same "never assert unless set"
-- pattern as mailing_address: passed into the call as a Vapi variable via
-- lib/vapi.ts::triggerOutboundCall, and the assistant is told to ask instead
-- of guessing when either is missing.

alter table customers
  add column if not exists date_of_birth date,
  add column if not exists beneficiary_name text;

-- Structured intake fields for the customer record, requested as a fixed
-- 16-field set. Several already existed under a different internal name and
-- are just relabeled in the UI (see types/database.ts for the mapping):
--   Date of Birth -> date_of_birth, Home Address -> mailing_address,
--   State/Province -> province, Beneficiary -> beneficiary_name,
--   Email Address -> email, Requested # of Kit(s) -> kit_count,
--   Best Time to Call -> preferred_meeting_time (previously AI-call-only,
--   now also settable by hand on the form).
--
-- Everything below is genuinely new and nullable — none of it was collected
-- before, and none of it is required to place a call.

alter table customers
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists city text,
  add column if not exists postal_code text,
  -- Beneficiary's relationship to the customer — kept separate from
  -- beneficiary_name, never combined.
  add column if not exists relationship text,
  -- Kept separate from both `phone` (the number Riley actually dials) and
  -- cellular_phone below.
  add column if not exists home_telephone text,
  add column if not exists cellular_phone text,
  add column if not exists shift text;

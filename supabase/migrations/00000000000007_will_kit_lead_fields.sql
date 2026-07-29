-- Will-kit campaign fields.
--
-- Riley now calls leads who requested a free Last Will & Testament kit
-- online, and the script confirms the details of that request back to them
-- (email, province, how many kits, mailing address, when they asked). The
-- assistant is told never to assert any of these unless it has the value, so
-- every one of them has to live on the lead's row and be passed into the call
-- as a Vapi variable (see lib/vapi.ts::triggerOutboundCall).
--
-- confirmation_code is read out during the write-down close at the end of the
-- call, so it's generated once per lead and stays stable across callbacks.

alter table customers
  add column if not exists province text,
  add column if not exists kit_count integer,
  add column if not exists mailing_address text,
  add column if not exists request_date date,
  add column if not exists confirmation_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_kit_count_check'
  ) then
    alter table customers
      add constraint customers_kit_count_check
      check (kit_count is null or kit_count between 1 and 10);
  end if;
end $$;

-- Six hex characters — short enough to read over the phone and write down,
-- and no letter that sounds like a digit (md5 only yields 0-9 and A-F).
create or replace function generate_confirmation_code() returns text
  language sql volatile as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

alter table customers
  alter column confirmation_code set default generate_confirmation_code();

update customers
  set confirmation_code = generate_confirmation_code()
  where confirmation_code is null;

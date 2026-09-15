-- Scheduled redial ("Contact again") — lets an agent, after finishing a
-- contact in *any* status (Sold, Contacted, Done, etc.), pick a number of
-- months after which this customer should automatically re-enter the
-- auto-dialer. Independent of the follow_up/no_answer auto-retry system
-- (customers.next_retry_at, see 00000000000017_call_retry_scheduling.sql) —
-- that one is spawned automatically by resolve-call-outcome for a
-- campaign's own retry cycle; this one is a manual, agent-picked schedule
-- that works from any status and isn't tied to an originating campaign.

alter table customers
  add column if not exists next_contact_at timestamptz;

create index if not exists customers_next_contact_at_idx
  on customers (next_contact_at)
  where next_contact_at is not null;

-- Cron job: every 15 minutes, ask the Next.js app to dial anyone whose
-- next_contact_at has arrived. Authenticates with RECONTACT_CRON_SECRET,
-- read from Vault the same way retry_cron_secret is (see
-- 00000000000017_call_retry_scheduling.sql). Before this runs correctly you
-- must, once, via the SQL editor (not a migration):
--
--   select vault.create_secret(
--     '<same random value as the app's RECONTACT_CRON_SECRET env var>',
--     'recontact_cron_secret'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-scheduled-recontacts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://riley-booking.vercel.app/api/cron/process-scheduled-recontacts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'recontact_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

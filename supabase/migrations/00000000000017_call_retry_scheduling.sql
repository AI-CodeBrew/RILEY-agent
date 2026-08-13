-- Auto-retry scheduling for customers whose calls end in `follow_up` or
-- `no_answer`. resolve-call-outcome (supabase/functions/_shared) decides
-- *when* the next attempt should happen and writes customers.next_retry_at;
-- a separate cron-driven Next.js route (app/api/cron/process-retries) acts
-- on it by actually placing the call once that time arrives. Mirrors the
-- split already used for reconcile-live-calls.

alter table customers
  add column if not exists retry_count int not null default 0,
  add column if not exists next_retry_at timestamptz;

create index if not exists customers_next_retry_at_idx
  on customers (next_retry_at)
  where next_retry_at is not null;

alter table sales_agents
  add column if not exists retry_delay_minutes int not null default 120
    check (retry_delay_minutes > 0),
  add column if not exists retry_max_attempts int not null default 5
    check (retry_max_attempts >= 0),
  add column if not exists retry_window_start time not null default '09:00',
  add column if not exists retry_window_end time not null default '18:00';

alter table sales_agents
  drop constraint if exists sales_agents_retry_window_check;
alter table sales_agents
  add constraint sales_agents_retry_window_check
  check (retry_window_end > retry_window_start);

-- Cron job: every 5 minutes, ask the Next.js app to dial anyone whose
-- next_retry_at has arrived. Authenticates with RETRY_CRON_SECRET, read
-- from Vault the same way reconcile_cron_secret is (see
-- 00000000000010_reconcile_live_calls_cron.sql). Before this runs
-- correctly you must, once, via the SQL editor (not a migration):
--
--   select vault.create_secret(
--     '<same random value as the app's RETRY_CRON_SECRET env var>',
--     'retry_cron_secret'
--   );
--
-- and replace the placeholder URL below with the app's real deployed
-- domain.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-call-retries',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<your-deployed-domain>/api/cron/process-retries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'retry_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

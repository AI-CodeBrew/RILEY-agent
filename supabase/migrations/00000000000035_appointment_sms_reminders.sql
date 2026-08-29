-- 1-hour-before SMS reminders. Schedules send-appointment-reminders (an
-- Edge Function that texts customers via each agent's own Twilio account) to
-- run every 5 minutes, same pg_cron/pg_net backstop pattern as
-- reconcile-live-calls — see 00000000000010_reconcile_live_calls_cron.sql.
--
-- Reuses that same RECONCILE_CRON_SECRET/vault 'reconcile_cron_secret' —
-- verifyCronSecret() (_shared/cron-auth.ts) already guards any internal,
-- cron-only function with it, not just reconcile-live-calls specifically.

alter table appointments
  add column if not exists reminder_sent_at timestamptz;

-- Narrows the cron function's poll query to appointments that still need a
-- reminder, without scanning every row on every 5-minute tick.
create index if not exists appointments_pending_reminder_idx
  on appointments (scheduled_at)
  where reminder_sent_at is null;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://oznfpovlmpokkoslrnti.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reconcile_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

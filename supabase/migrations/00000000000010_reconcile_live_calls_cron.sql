-- Backstop for stuck "calling" state: schedules reconcile-live-calls (an
-- Edge Function that polls Vapi directly for calls stuck in a live status)
-- to run every 7 minutes. See supabase/functions/reconcile-live-calls.
--
-- The cron job authenticates to the function with RECONCILE_CRON_SECRET,
-- read from Vault rather than hardcoded here so the actual secret value
-- never lands in a committed migration file. Before this runs correctly,
-- set it once via the SQL editor (not a migration):
--
--   select vault.create_secret(
--     '<same random value as `supabase secrets set RECONCILE_CRON_SECRET=...`>',
--     'reconcile_cron_secret'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'reconcile-live-calls',
  '*/7 * * * *',
  $$
  select net.http_post(
    url := 'https://oznfpovlmpokkoslrnti.supabase.co/functions/v1/reconcile-live-calls',
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

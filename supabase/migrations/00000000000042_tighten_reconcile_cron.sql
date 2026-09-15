-- Tightens reconcile-live-calls' poll cadence from 15s to 4s so the new
-- 16-second ring_timeout_seconds option (00000000000041_ring_timeout_16_30.sql)
-- actually lands meaningfully earlier than the 30-second option, instead of
-- both resolving on roughly the same 15s poll tick.
select cron.unschedule('reconcile-live-calls');

select cron.schedule(
  'reconcile-live-calls',
  '4 seconds',
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

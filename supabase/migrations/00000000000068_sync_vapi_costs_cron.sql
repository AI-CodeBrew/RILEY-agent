-- Hourly re-check of recent calls' cost against Vapi, so `calls.cost` stays
-- exact for the admin Costs page even after Vapi drops the call itself
-- (~2 weeks). See app/api/cron/sync-vapi-costs/route.ts.
--
-- Reuses the existing `retry_cron_secret` vault secret (same one
-- process-call-retries sends) — the route checks RETRY_CRON_SECRET.
select cron.schedule(
  'sync-vapi-costs',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://dialcom.ai/api/cron/sync-vapi-costs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'retry_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

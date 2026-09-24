-- Fixes a wrong target domain on every pg_cron job that calls this Next.js
-- app (process-call-retries, process-scheduled-recontacts, process-campaigns).
-- All three were pointed at `riley-booking.vercel.app`, which returns
-- `404 DEPLOYMENT_NOT_FOUND` — confirmed live via net._http_response, e.g.
-- request id 392647: "The deployment could not be found on Vercel." That
-- domain isn't one of this project's actual aliases (checked via `vercel
-- inspect`: production is served on dialcom.ai / dialcomai.com /
-- riley-booking-dialcom.vercel.app, never riley-booking.vercel.app).
--
-- Net effect before this fix: pg_cron's own job history showed
-- "succeeded" on every run, because cron.schedule's net.http_post only
-- confirms the request was *queued* (pg_net is async) — the real HTTP
-- outcome lands separately in net._http_response, which is where the 404s
-- actually showed up. So process-call-retries (follow_up/no_answer redials)
-- and process-campaigns (this session's browser-close backstop) have been
-- silently no-op-ing every tick since whenever this URL broke.
--
-- cron.schedule upserts by job name, so re-running it here with the correct
-- URL fixes the existing jobs in place rather than creating duplicates.
select cron.schedule(
  'process-call-retries',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dialcom.ai/api/cron/process-retries',
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

select cron.schedule(
  'process-scheduled-recontacts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://dialcom.ai/api/cron/process-scheduled-recontacts',
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

select cron.schedule(
  'process-campaigns',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://dialcom.ai/api/cron/process-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'campaign_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

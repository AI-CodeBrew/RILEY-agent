-- Server-side backstop for the Auto Dialer. Before this migration,
-- advanceCampaign (lib/campaign.ts) — the function that actually places
-- each next call — was only ever invoked from the browser: once from the
-- Start button, and then every 15s from CampaignPanel.tsx's client-side
-- setInterval for as long as an agent kept that tab open and foregrounded.
-- Closing the browser, or the tab being backgrounded/throttled/suspended,
-- silently stopped a "running" campaign from dialing anyone else even
-- though its DB status still said running.
--
-- This schedules a Next.js route (app/api/cron/process-campaigns) to call
-- advanceCampaign for every running/scheduled campaign once a minute,
-- independent of whether any browser has the page open. The client-side
-- tick is left in place for snappier UI feedback while a tab is open — both
-- are safe to run concurrently since advanceCampaign re-checks window/gap/
-- live-call state itself before dialing (see lib/campaign.ts).
--
-- Authenticates with CAMPAIGN_CRON_SECRET, read from Vault the same way
-- retry_cron_secret is (see 00000000000017_call_retry_scheduling.sql).
-- Before this runs correctly you must, once, via the SQL editor (not a
-- migration):
--
--   select vault.create_secret(
--     '<same random value as the app's CAMPAIGN_CRON_SECRET env var>',
--     'campaign_cron_secret'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-campaigns',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://riley-booking.vercel.app/api/cron/process-campaigns',
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

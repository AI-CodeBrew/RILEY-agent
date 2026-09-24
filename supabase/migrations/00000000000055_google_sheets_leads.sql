-- Google Sheets lead-import: an agent connects the Google Sheet their
-- lead-gen ads (Meta Lead Ads etc.) deliver new rows into, and a poller
-- picks up newly-appended rows, creates matching `customers` rows, and
-- triggers an AI call — replacing a manual CSV export/import.
--
-- One row per agent (like the existing zoom/google_meet connections on
-- sales_agents), but kept in its own table rather than more sales_agents
-- columns since this carries a fair amount of sheet-specific state.
create table if not exists google_sheet_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references sales_agents(id) on delete cascade,

  -- OAuth (drive.file scope — access limited to the one file the agent
  -- picks via the Google Picker, see lib/google-sheets.ts).
  google_refresh_token text,
  google_account_email text,

  -- Set once the agent picks a file via the Picker (select-sheet route).
  spreadsheet_id text,
  spreadsheet_name text,

  -- Set once the agent maps columns (mapping route) — spreadsheet column
  -- letters ("A", "B", ...), resolved from header names at mapping time so
  -- the poller never has to re-read the header row.
  name_column text,
  phone_column text,
  email_column text,

  -- Poller bookkeeping. Row 1 is the header, so a fresh connection starts
  -- at last_row_synced = (current row count), meaning only rows added
  -- *after* the agent connects get imported — an ads sheet can easily have
  -- months of old leads already in it, and auto-calling all of them the
  -- moment someone connects would be its own incident.
  last_row_synced int not null default 1,
  -- Google Drive's modifiedTime for the file as of the last poll — lets the
  -- poller skip the Sheets API read entirely when nothing changed.
  last_modified_time text,
  last_synced_at timestamptz,

  -- pending: OAuth done, sheet/mapping not finished yet.
  -- connected: poller actively imports new rows.
  -- disconnected: token invalid (revoked/expired) or agent disconnected;
  --   spreadsheet/mapping are kept so reconnecting doesn't repeat the
  --   picker+mapping steps.
  status text not null default 'pending' check (status in ('pending', 'connected', 'disconnected')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table oauth_states
  drop constraint if exists oauth_states_provider_check;
alter table oauth_states
  add constraint oauth_states_provider_check
    check (provider in ('zoom', 'google_meet', 'google_sheets'));

-- Cron: every 15 seconds, ask the Next.js app to poll every connected
-- sheet for new rows. Same net.http_post + Vault-secret pattern as the
-- other app crons (see 00000000000054_fix_cron_domain.sql for why the
-- domain matters) — authenticates with SHEETS_CRON_SECRET. Before this
-- runs correctly you must, once, via the SQL editor (not a migration):
--
--   select vault.create_secret(
--     '<same random value as the app's SHEETS_CRON_SECRET env var>',
--     'sheets_cron_secret'
--   );
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-sheet-leads',
  '15 seconds',
  $$
  select net.http_post(
    url := 'https://dialcom.ai/api/cron/process-sheet-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sheets_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

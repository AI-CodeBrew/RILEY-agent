-- Optional "Call type" column of an agent's lead sheet (values like will_kit,
-- union, pos, association). The poller (app/api/cron/process-sheet-leads)
-- reads it into customers.call_type, which decides the script the bot uses —
-- without it every Google Sheets lead falls back to the agent's default script.
alter table google_sheet_connections
  add column if not exists call_type_column text;

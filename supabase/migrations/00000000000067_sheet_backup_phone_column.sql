-- Optional second phone column on an agent's lead sheet (e.g. "Home Phone"
-- next to "Mobile"). The poller (app/api/cron/process-sheet-leads) dials
-- phone_column's number, and falls back to this one when a row's main phone
-- is empty or isn't a callable number — so a lead isn't skipped just because
-- it filled in the other phone field.
alter table google_sheet_connections
  add column if not exists backup_phone_column text;

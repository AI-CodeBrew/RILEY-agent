-- Lead sheets name people in different ways: one "Name" / "Full Name"
-- column, or separate "First Name" and "Last Name" columns. name_column
-- stays the full-name column; these two are the optional first/last name
-- columns. The poller (app/api/cron/process-sheet-leads) uses the full name
-- when there is one, otherwise joins first + last, and also stores them in
-- customers.first_name / last_name. A connection needs a phone column and
-- at least one of the three name columns — so name_column may now be null.
alter table google_sheet_connections
  add column if not exists first_name_column text,
  add column if not exists last_name_column text;

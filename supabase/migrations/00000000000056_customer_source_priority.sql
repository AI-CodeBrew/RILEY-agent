-- Where a customer came from, and whether they jump the auto-dial line.
-- Google Sheets leads (see 00000000000055_google_sheets_leads.sql) land in
-- the same `customers` table as everyone else, tagged source='google_sheet'
-- with priority='high'; the auto-dialer (lib/campaign.ts) calls any
-- priority='high' + status='new' customer ahead of a campaign's own
-- members. Everyone else keeps priority='normal' and today's behavior.
--
-- Rows that already exist default to source='manual' — there's no record of
-- which ones came from a CSV import versus the Add Customer form, so they
-- aren't guessed at. New CSV imports are tagged 'csv' going forward.
alter table customers
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'csv', 'google_sheet')),
  add column if not exists priority text not null default 'normal'
    check (priority in ('normal', 'high'));

-- The priority queue lookup: one agent's high-priority, not-yet-called
-- customers, oldest first.
create index if not exists customers_priority_queue_idx
  on customers (agent_id, created_at)
  where priority = 'high' and status = 'new';

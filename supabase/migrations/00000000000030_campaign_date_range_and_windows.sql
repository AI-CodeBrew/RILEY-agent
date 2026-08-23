-- Replaces the global recurring agent_dial_schedules (added in
-- 00000000000028) with per-campaign scheduling: a campaign now runs across
-- a date range (start_date..end_date) with one or more daily time windows
-- (e.g. 8-11am and 4-8pm), instead of a single one-shot window_start/
-- window_end instant. A campaign no longer completes just because "today's"
-- window closed — it waits for the next window (same day or a later date in
-- the range) and keeps working through the same pending customer list,
-- until either the list is exhausted or the date range ends. See
-- lib/campaign.ts (advanceCampaign) and lib/campaign-schedule.ts.

-- 1. Daily time windows, one-to-many per campaign.
create table if not exists dial_campaign_windows (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references dial_campaigns (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  constraint dial_campaign_windows_time_check check (end_time > start_time)
);

create index if not exists dial_campaign_windows_campaign_idx
  on dial_campaign_windows (campaign_id);

alter table dial_campaign_windows enable row level security;

create policy "service role full access - dial_campaign_windows" on dial_campaign_windows
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. Date range on the campaign itself, replacing window_start/window_end.
alter table dial_campaigns
  add column if not exists start_date date,
  add column if not exists end_date date;

-- Backfill existing rows from their old single window so nothing already
-- created breaks: the whole date span collapses to one day, and that day's
-- time-of-day becomes its one window.
update dial_campaigns
  set start_date = coalesce(start_date, window_start::date),
      end_date = coalesce(end_date, window_end::date)
  where start_date is null or end_date is null;

insert into dial_campaign_windows (campaign_id, start_time, end_time)
select id, window_start::time, window_end::time
from dial_campaigns
where window_end::time > window_start::time
  and not exists (
    select 1 from dial_campaign_windows w where w.campaign_id = dial_campaigns.id
  );

alter table dial_campaigns
  alter column start_date set not null,
  alter column end_date set not null;

alter table dial_campaigns
  drop constraint if exists dial_campaigns_date_range_check;
alter table dial_campaigns
  add constraint dial_campaigns_date_range_check check (end_date >= start_date);

alter table dial_campaigns
  drop column if exists window_start,
  drop column if exists window_end;

-- 3. Global recurring schedules are superseded by the per-campaign model
-- above — every auto-dial run (and the retries it spawns) now clamps into
-- its own originating campaign's windows/date range instead of a
-- store-wide "business hours" setting.
drop table if exists agent_dial_schedules;

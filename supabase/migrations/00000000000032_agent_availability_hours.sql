-- Local weekly-hours preference shown on Calendar → Availability. This is
-- NOT the source of truth for what Riley actually offers on a call — that
-- still comes entirely from the agent's connected Calendly account (see
-- supabase/functions/check-agent-availability). This table exists so the
-- portal can show/edit hours natively, and so a future in-house
-- availability engine can read from the same shape without another
-- migration or UI rework.
create table if not exists agent_availability_hours (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching calendar-dates.ts WEEKDAY_LABELS.
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint agent_availability_hours_range_check check (end_time > start_time)
);

create index if not exists agent_availability_hours_agent_id_idx
  on agent_availability_hours (agent_id);

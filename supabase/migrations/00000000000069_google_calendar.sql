-- Google Calendar as a third booking calendar, alongside Calendly and the
-- portal's own weekly hours (agent_availability_hours). Most agents already
-- run their week from Google Calendar, so in this mode Google is the source
-- of truth: open windows come from a dedicated "availability" calendar the
-- agent keeps in Google (each event there = a block of time they're free),
-- the agent's real meetings are subtracted via the freeBusy API, and Riley's
-- bookings are written straight back into the agent's Google Calendar.
--
-- Booking calendar is now an explicit per-agent choice. Until now the mode
-- was inferred (any weekly hours = local, otherwise Calendly); that inference
-- breaks with three providers, since a Google agent may still keep weekly
-- hours as a fallback. Null keeps the old inference, so agents who never
-- visit the picker behave exactly as before.
alter table sales_agents
  add column if not exists calendar_provider text
    check (calendar_provider in ('crm', 'calendly', 'google'));

update sales_agents a
set calendar_provider = case
  when exists (select 1 from agent_availability_hours h where h.agent_id = a.id) then 'crm'
  when a.calendly_user_uri is not null then 'calendly'
  else null
end
where a.calendar_provider is null;

-- One row per agent, kept apart from the google_* columns on sales_agents:
-- those belong to the Google Meet connection, which only has the
-- meetings.space.created scope and can't read or write calendars.
create table if not exists google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references sales_agents(id) on delete cascade,

  -- OAuth, encrypted with lib/token-crypto.ts like every other provider token.
  google_access_token text,
  google_refresh_token text,
  google_token_expires_at timestamptz,
  google_account_email text,

  -- The calendar whose events mark when the agent is free. Null until the
  -- agent picks (or has us create) one — check-agent-availability falls
  -- back to agent_availability_hours until then.
  availability_calendar_id text,
  availability_calendar_name text,

  -- Calendars whose events count as busy. Never includes the availability
  -- calendar itself, or its "Available" blocks would cancel themselves out.
  busy_calendar_ids text[] not null default array['primary'],

  -- Where Riley's bookings are created.
  booking_calendar_id text not null default 'primary',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Holds OAuth tokens — only ever read server-side through the service role.
alter table google_calendar_connections enable row level security;

drop policy if exists "service role full access - google_calendar_connections" on google_calendar_connections;
create policy "service role full access - google_calendar_connections" on google_calendar_connections
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- The Google event behind a booking, so canceling or rescheduling from the
-- portal or a call can update the agent's real calendar too.
alter table appointments
  add column if not exists google_event_id text,
  add column if not exists google_calendar_id text;

alter table oauth_states
  drop constraint if exists oauth_states_provider_check;
alter table oauth_states
  add constraint oauth_states_provider_check
    check (provider in ('zoom', 'google_meet', 'google_sheets', 'google_calendar'));

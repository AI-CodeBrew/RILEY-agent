-- Phase 3: Zoom as the video-conferencing option for locally-booked
-- appointments (see 00000000000032_agent_availability_hours.sql for the
-- local-availability table this feeds into).

alter table sales_agents
  add column if not exists video_provider text
    check (video_provider in ('zoom')),
  add column if not exists zoom_access_token text,
  add column if not exists zoom_refresh_token text,
  add column if not exists zoom_token_expires_at timestamptz,
  add column if not exists zoom_account_email text,
  add column if not exists zoom_connected_at timestamptz;

-- Short-lived CSRF state for the Zoom OAuth redirect flow — an agent starts
-- the flow, we stash a random state tied to their id, Zoom's callback can
-- only proceed if it comes back with a state we actually issued and haven't
-- already consumed.
create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  provider text not null check (provider in ('zoom')),
  state text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists oauth_states_state_idx on oauth_states (state);
create index if not exists oauth_states_agent_id_idx on oauth_states (agent_id);

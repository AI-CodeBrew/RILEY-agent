-- Google Meet as a second video-conferencing option for locally-booked
-- appointments, alongside Zoom (see 00000000000033_agent_zoom.sql). A Meet
-- link is produced by creating a Google Calendar event with conferenceData,
-- so this connects the agent's Google Calendar, not a standalone "Meet" API.

alter table sales_agents
  drop constraint if exists sales_agents_video_provider_check;

alter table sales_agents
  add constraint sales_agents_video_provider_check
    check (video_provider in ('zoom', 'google_meet'));

alter table sales_agents
  add column if not exists google_access_token text,
  add column if not exists google_refresh_token text,
  add column if not exists google_token_expires_at timestamptz,
  add column if not exists google_account_email text,
  add column if not exists google_connected_at timestamptz;

alter table oauth_states
  drop constraint if exists oauth_states_provider_check;

alter table oauth_states
  add constraint oauth_states_provider_check
    check (provider in ('zoom', 'google_meet'));

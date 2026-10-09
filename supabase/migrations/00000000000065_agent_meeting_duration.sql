-- How long each appointment Riley books for this agent lasts: 30 or 60
-- minutes, picked on Calendar → Availability. Drives the slots
-- check-agent-availability generates off the agent's weekly hours (a
-- 60-minute meeting only fits where a full hour is free, and candidates step
-- by the hour), the conflict/buffer check, the duration stored on the
-- appointment, and the length of the Zoom meeting created for it. For
-- Calendly-mode agents it picks the event type whose duration matches, when
-- they have one. The 30-minute buffer between appointments is unchanged.
-- Default 30 = the behaviour before this column existed.

alter table sales_agents
  add column if not exists meeting_duration_minutes int not null default 30
    check (meeting_duration_minutes in (30, 60));

-- Per-agent defaults set from the new "AI Integration" sidebar page: which
-- voice new calls default to, and which script the agent is currently
-- running. Script is storage-only for now — POS is the only flow actually
-- implemented in vapi/agent.md; UNION and WILL_KIT don't change call
-- behavior yet.

alter table sales_agents
  add column if not exists default_voice_gender text
    check (default_voice_gender in ('male', 'female')),
  add column if not exists default_script text
    check (default_script in ('POS', 'UNION', 'WILL_KIT'));

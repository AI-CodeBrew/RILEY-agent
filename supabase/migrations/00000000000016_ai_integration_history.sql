-- Audit trail for the AI Integration page — every time an agent changes
-- their default voice or script, a row lands here so the page can show
-- "what did I have this set to before".

create table if not exists agent_ai_preference_changes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  field text not null check (field in ('voice_gender', 'script')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index if not exists agent_ai_preference_changes_agent_idx
  on agent_ai_preference_changes (agent_id, changed_at desc);

alter table agent_ai_preference_changes enable row level security;

create policy "service role full access - agent_ai_preference_changes"
  on agent_ai_preference_changes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Log inbound calls to agent numbers (display only — never answered by AI).

create table if not exists inbound_calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references sales_agents (id) on delete set null,
  vapi_phone_number_id text,
  called_number text not null,
  caller_phone text not null,
  caller_name text,
  vapi_call_id text,
  is_repeat boolean not null default false,
  repeat_count int not null default 1,
  status text not null default 'rejected'
    check (status in ('rejected', 'missed')),
  created_at timestamptz not null default now()
);

create index if not exists inbound_calls_agent_created_idx
  on inbound_calls (agent_id, created_at desc);

create index if not exists inbound_calls_caller_agent_idx
  on inbound_calls (caller_phone, agent_id);

alter table inbound_calls enable row level security;

create policy "service role full access - inbound_calls" on inbound_calls
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

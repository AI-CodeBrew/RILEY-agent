-- Auto-dial campaigns, call insights, and CRM fields from AI calls.

create table if not exists dial_campaigns (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'paused', 'stopped', 'completed')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  gap_seconds int not null default 120,
  current_customer_id uuid references customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dial_campaigns_agent_status_idx
  on dial_campaigns (agent_id, status);

create table if not exists dial_campaign_customers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references dial_campaigns (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  sort_order int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'dialing', 'completed', 'skipped')),
  unique (campaign_id, customer_id)
);

create index if not exists dial_campaign_customers_campaign_idx
  on dial_campaign_customers (campaign_id, sort_order);

alter table calls
  add column if not exists campaign_id uuid references dial_campaigns (id) on delete set null,
  add column if not exists call_insights jsonb;

alter table customers
  add column if not exists spouse_name text,
  add column if not exists employment_status text,
  add column if not exists household_type text,
  add column if not exists preferred_meeting_time text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists call_insights jsonb,
  add column if not exists last_call_summary text;

alter table dial_campaigns enable row level security;
alter table dial_campaign_customers enable row level security;

create policy "service role full access - dial_campaigns" on dial_campaigns
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access - dial_campaign_customers" on dial_campaign_customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

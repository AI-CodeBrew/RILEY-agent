-- Riley Booking: initial schema
-- Single-tenant, no auth/roles yet.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  status text not null default 'new'
    check (status in ('new', 'call_scheduled', 'calling', 'contacted', 'appointment_set', 'no_answer', 'not_interested', 'do_not_call')),
  created_at timestamptz not null default now()
);

create index if not exists customers_status_idx on customers (status);

-- ---------------------------------------------------------------------------
-- sales_agents
-- ---------------------------------------------------------------------------
create table if not exists sales_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  calendly_url text,
  calendly_access_token text,
  calendly_refresh_token text,
  calendly_user_uri text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  agent_id uuid references sales_agents (id) on delete set null,
  scheduled_at timestamptz not null,
  zoom_link text,
  calendly_event_uri text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'canceled', 'no_show')),
  created_at timestamptz not null default now()
);

create index if not exists appointments_customer_id_idx on appointments (customer_id);
create index if not exists appointments_agent_id_idx on appointments (agent_id);
create index if not exists appointments_scheduled_at_idx on appointments (scheduled_at);

-- ---------------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------------
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  agent_id uuid references sales_agents (id) on delete set null,
  vapi_call_id text unique,
  transcript text,
  outcome text
    check (outcome in ('appointment_set', 'no_answer', 'voicemail', 'not_interested', 'call_back_later', 'error') or outcome is null),
  created_at timestamptz not null default now()
);

create index if not exists calls_customer_id_idx on calls (customer_id);
create index if not exists calls_agent_id_idx on calls (agent_id);
create index if not exists calls_vapi_call_id_idx on calls (vapi_call_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- No auth/roles yet (single-tenant, internal tool). RLS is enabled with a
-- permissive policy for the service role only; the Next.js app talks to
-- Supabase using the service role key from trusted server-side code
-- (API routes / Edge Functions), never from the browser.
-- ---------------------------------------------------------------------------
alter table customers enable row level security;
alter table sales_agents enable row level security;
alter table appointments enable row level security;
alter table calls enable row level security;

create policy "service role full access - customers" on customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access - sales_agents" on sales_agents
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access - appointments" on appointments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access - calls" on calls
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

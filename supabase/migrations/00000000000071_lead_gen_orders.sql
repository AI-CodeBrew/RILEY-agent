-- Lead-gen orders placed from the portal's "Leads Gen" tab — an agent picks
-- demographics, a call type/process and a fixed package, pays once
-- through Stripe Checkout (see app/api/lead-gen/orders/route.ts), and an
-- admin then takes the paid order live by hand. Package prices live in
-- lib/lead-gen.ts; amount_cents is snapshotted here at order time so a later
-- price change never rewrites what someone already paid.

create table if not exists lead_gen_orders (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,

  -- Demographics
  provinces text[] not null default '{}',
  cities text,
  age_min integer check (age_min is null or age_min between 18 and 100),
  age_max integer check (age_max is null or age_max between 18 and 100),
  income_bracket text not null default 'any'
    check (income_bracket in ('any', 'under_50k', '50k_100k', '100k_plus')),
  homeowner text not null default 'any'
    check (homeowner in ('any', 'homeowner', 'renter')),
  gender text not null default 'any'
    check (gender in ('any', 'male', 'female')),
  language text not null default 'any'
    check (language in ('any', 'english', 'french')),

  -- Call type & process (the call type is the script the calls follow)
  call_type text not null
    check (call_type in ('POS', 'UNION', 'WILL_KIT', 'ASSOCIATION', 'POS_LIBERTY', 'RECRUITMENT', 'RECPAZ')),
  process_notes text,

  -- Package & payment
  package text not null,
  lead_count integer not null check (lead_count > 0),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'live', 'canceled')),
  stripe_checkout_session_id text unique,
  paid_at timestamptz,
  live_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (age_min is null or age_max is null or age_min <= age_max)
);

create index if not exists lead_gen_orders_agent_idx
  on lead_gen_orders (agent_id, created_at desc);

create index if not exists lead_gen_orders_status_idx
  on lead_gen_orders (status, created_at desc);

alter table lead_gen_orders enable row level security;

create policy "service role full access - lead_gen_orders" on lead_gen_orders
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

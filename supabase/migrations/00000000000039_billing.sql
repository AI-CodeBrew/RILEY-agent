-- Stripe subscription billing. Single-tenant app (see supabase-admin.ts), so
-- there is exactly one paying account — modeled as a singleton row at a
-- fixed id rather than a real accounts table, so app code never has to find
-- it, only update it.
create table if not exists billing_accounts (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('standard', 'with_calendar')),
  status text not null default 'incomplete'
    check (status in ('incomplete', 'active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into billing_accounts (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- Stripe retries webhook deliveries, so the same event id can arrive more
-- than once. Recording processed ids makes the handler idempotent.
create table if not exists stripe_webhook_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

alter table billing_accounts enable row level security;
alter table stripe_webhook_events enable row level security;

create policy "service role full access - billing_accounts" on billing_accounts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "service role full access - stripe_webhook_events" on stripe_webhook_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

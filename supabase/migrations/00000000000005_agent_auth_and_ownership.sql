-- Turns the single-tenant portal into a multi-agent one:
--   * sales_agents rows are now backed by a Supabase Auth user, so each agent
--     signs in with their own account (role 'agent') and only sees their own
--     book of business. 'admin' sees everything and provisions the others.
--   * customers are owned by an agent.
--   * calls track live state so an in-flight/queued call can be canceled from
--     the portal.
--   * appointments keep Calendly's cancel/reschedule links so they can be
--     managed from the portal instead of only from Calendly.

-- ---------------------------------------------------------------------------
-- sales_agents: auth identity + role
-- ---------------------------------------------------------------------------
alter table sales_agents
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null,
  add column if not exists role text not null default 'agent',
  add column if not exists is_active boolean not null default true,
  add column if not exists phone text,
  add column if not exists timezone text not null default 'America/New_York';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_agents_role_check'
  ) then
    alter table sales_agents
      add constraint sales_agents_role_check check (role in ('agent', 'admin'));
  end if;
end $$;

create index if not exists sales_agents_auth_user_id_idx on sales_agents (auth_user_id);

-- ---------------------------------------------------------------------------
-- customers: ownership + light CRM fields
-- ---------------------------------------------------------------------------
alter table customers
  add column if not exists agent_id uuid references sales_agents (id) on delete set null,
  add column if not exists company text,
  add column if not exists notes text,
  add column if not exists timezone text,
  add column if not exists last_contacted_at timestamptz;

create index if not exists customers_agent_id_idx on customers (agent_id);

-- ---------------------------------------------------------------------------
-- calls: live state, so a queued/ringing/in-progress call can be canceled
-- ---------------------------------------------------------------------------
alter table calls
  add column if not exists status text not null default 'queued',
  add column if not exists control_url text,
  add column if not exists ended_reason text,
  add column if not exists duration_seconds integer,
  add column if not exists cost numeric(10, 4),
  add column if not exists summary text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists triggered_by uuid references sales_agents (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calls_status_check'
  ) then
    alter table calls
      add constraint calls_status_check
      check (status in ('scheduled', 'queued', 'ringing', 'in_progress', 'ended', 'canceled', 'failed'));
  end if;
end $$;

-- Every row that exists at migration time is history, not a live call —
-- leaving them on the 'queued' default would show them as in-flight in the
-- portal, complete with a hang-up button Vapi no longer knows anything about.
update calls set status = 'ended' where status = 'queued';

-- Same reasoning for customers left mid-dial by a call that predates the
-- status column: nothing is calling them right now.
update customers set status = 'contacted' where status = 'calling';

create index if not exists calls_status_idx on calls (status);

-- ---------------------------------------------------------------------------
-- appointments: manage from the portal, not just from Calendly
-- ---------------------------------------------------------------------------
alter table appointments
  add column if not exists booking_url text,
  add column if not exists cancel_url text,
  add column if not exists reschedule_url text,
  add column if not exists duration_minutes integer not null default 30,
  add column if not exists source text not null default 'voice_agent',
  add column if not exists notes text,
  add column if not exists canceled_reason text,
  add column if not exists canceled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_source_check'
  ) then
    alter table appointments
      add constraint appointments_source_check check (source in ('voice_agent', 'manual'));
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists appointments_touch_updated_at on appointments;
create trigger appointments_touch_updated_at
  before update on appointments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for signed-in agents
--
-- The Next.js server still does its reads/writes with the service role key
-- (and scopes every query to the signed-in agent in lib/auth.ts), so these
-- policies are defence in depth: if a row is ever fetched with a user's own
-- access token, an agent can only ever see their own book of business.
-- ---------------------------------------------------------------------------
create or replace function public.current_agent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from sales_agents where auth_user_id = auth.uid() and is_active limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from sales_agents
    where auth_user_id = auth.uid() and is_active and role = 'admin'
  );
$$;

grant execute on function public.current_agent_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "agents read own customers" on customers;
create policy "agents read own customers" on customers
  for select to authenticated
  using (public.is_admin() or agent_id = public.current_agent_id());

drop policy if exists "agents read own agent row" on sales_agents;
create policy "agents read own agent row" on sales_agents
  for select to authenticated
  using (public.is_admin() or id = public.current_agent_id());

drop policy if exists "agents read own appointments" on appointments;
create policy "agents read own appointments" on appointments
  for select to authenticated
  using (public.is_admin() or agent_id = public.current_agent_id());

drop policy if exists "agents read own calls" on calls;
create policy "agents read own calls" on calls
  for select to authenticated
  using (public.is_admin() or agent_id = public.current_agent_id());

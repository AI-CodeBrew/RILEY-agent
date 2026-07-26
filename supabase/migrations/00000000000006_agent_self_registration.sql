-- Sales agents now sign themselves up instead of being provisioned by an
-- admin. A registration lands as 'pending' and can't sign in until an admin
-- approves it from the Sales Agents tab; once approved the agent connects
-- their own Calendly and buys their own outbound number from Settings.

alter table sales_agents
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references sales_agents (id) on delete set null,
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_agents_approval_status_check'
  ) then
    alter table sales_agents
      add constraint sales_agents_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Everyone who already exists predates the approval gate — they were created
-- by an admin, so they're approved by definition. Without this backfill the
-- 'pending' default would lock the current admin out of their own portal.
update sales_agents
set approval_status = 'approved',
    approved_at = coalesce(approved_at, created_at)
where approval_status = 'pending';

create index if not exists sales_agents_approval_status_idx
  on sales_agents (approval_status);

-- current_agent_id()/is_admin() decide what RLS lets a user read. A pending or
-- rejected signup has a real auth.users row, so without approval_status here
-- they would resolve to a live agent id the moment they authenticated.
create or replace function public.current_agent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from sales_agents
  where auth_user_id = auth.uid()
    and is_active
    and approval_status = 'approved'
  limit 1;
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
    where auth_user_id = auth.uid()
      and is_active
      and approval_status = 'approved'
      and role = 'admin'
  );
$$;

-- Deterministic outbound-number routing by the customer's NANP area code.
-- Each agent maps up to 7 fixed Canadian regions (plus a "default" catch-all)
-- to one of their own connected numbers; calling logic never picks randomly
-- — see lib/area-code-routing.ts and lib/number-routing.ts.
create table if not exists agent_number_routes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  region text not null check (region in (
    'alberta', 'saskatchewan', 'ontario', 'nova_scotia_pei',
    'new_brunswick', 'newfoundland', 'manitoba', 'default'
  )),
  phone_number_id uuid not null references agent_phone_numbers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agent_id, region)
);

create index if not exists agent_number_routes_agent_id_idx
  on agent_number_routes (agent_id);

-- Records which connected number actually placed each call, per region routing.
alter table calls
  add column if not exists phone_number_id uuid references agent_phone_numbers (id) on delete set null;

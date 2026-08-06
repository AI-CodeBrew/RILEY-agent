-- Agents can now connect several outbound numbers at once (Settings →
-- Outbound number adds to this list, it no longer replaces a single
-- column). Calls and campaigns pick one explicitly instead of inheriting
-- whatever was on sales_agents.
create table if not exists agent_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  phone_number text not null unique,
  twilio_phone_number_sid text not null,
  vapi_phone_number_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_phone_numbers_agent_id_idx
  on agent_phone_numbers (agent_id);

-- Carry over each agent's existing single number as their first connected one.
insert into agent_phone_numbers (agent_id, phone_number, twilio_phone_number_sid, vapi_phone_number_id)
select id, vapi_phone_number, twilio_phone_number_sid, vapi_phone_number_id
from sales_agents
where vapi_phone_number_id is not null
  and vapi_phone_number is not null
  and twilio_phone_number_sid is not null
on conflict (phone_number) do nothing;

-- A campaign dials from one connected number, chosen when it's started.
alter table dial_campaigns
  add column if not exists phone_number_id uuid references agent_phone_numbers (id) on delete set null;

-- Best-effort backfill for any non-terminal campaign created before this
-- column existed, using whatever number that agent already had connected.
update dial_campaigns dc
set phone_number_id = apn.id
from agent_phone_numbers apn
where apn.agent_id = dc.agent_id
  and dc.phone_number_id is null;

-- `follow_up` has been written as a live customer status since resolve-call-
-- outcome shipped, but the original check constraint never included it —
-- patch it here so those updates stop silently violating the constraint.
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check
  check (status in ('new', 'call_scheduled', 'calling', 'contacted', 'appointment_set', 'follow_up', 'no_answer', 'not_interested', 'do_not_call'));

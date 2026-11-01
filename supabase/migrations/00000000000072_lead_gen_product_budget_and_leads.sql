-- Reshapes lead-gen orders to the DIALCOM lead-gen spec and adds the public
-- lead form's submissions.
--
-- Orders: the agent now picks a product, location, gender, age range, the
-- provinces/states they're licensed in and a free-form budget (paid as-is
-- through Stripe Checkout) instead of a fixed package + call type. The old
-- package/call-type/income/homeowner/language columns stay so earlier orders
-- keep their data, but new orders no longer fill them.
--
-- Leads: every paid order gets a public form at /quote/<order id>. Each
-- submission is stored with the exact consent wording the person saw and
-- which boxes they ticked, as the record of their consent to be contacted.

alter table lead_gen_orders
  add column if not exists product text
    check (product is null or product in (
      'term_life', 'whole_life', 'final_expense', 'mortgage_protection',
      'critical_illness', 'health_dental'
    )),
  -- 'CA-ON' / 'US-NY' style codes, see lib/lead-gen.ts LICENSE_REGIONS.
  add column if not exists licensed_regions text[] not null default '{}',
  -- Shown to leads in the consent wording ("[Agent/Agency Name]").
  add column if not exists agency_name text;

alter table lead_gen_orders alter column call_type drop not null;
alter table lead_gen_orders alter column package drop not null;
alter table lead_gen_orders alter column lead_count drop not null;

create table if not exists lead_gen_leads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references lead_gen_orders (id) on delete cascade,
  agent_id uuid not null references sales_agents (id) on delete cascade,

  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,

  -- Calls consent is required to submit; messages consent is optional.
  consent_calls boolean not null check (consent_calls),
  consent_messages boolean not null default false,
  -- The exact wording shown next to each box at submission time.
  consent_calls_text text not null,
  consent_messages_text text not null,
  ip_address text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists lead_gen_leads_order_idx
  on lead_gen_leads (order_id, created_at desc);

create index if not exists lead_gen_leads_agent_idx
  on lead_gen_leads (agent_id, created_at desc);

alter table lead_gen_leads enable row level security;

create policy "service role full access - lead_gen_leads" on lead_gen_leads
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

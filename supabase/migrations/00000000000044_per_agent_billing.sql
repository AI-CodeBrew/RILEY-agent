-- Moves billing from one shared, admin-managed account to a subscription
-- per agent — each agent now pays for and owns their own calling, instead
-- of the whole team sharing a single admin-controlled subscription. See
-- lib/billing.ts, app/api/billing/checkout, app/api/billing/portal, and
-- app/api/stripe/webhook.
--
-- The one subscription that existed under the old singleton model was a
-- test-mode subscription created while building this feature — it's being
-- canceled directly in Stripe and abandoned here; every agent starts fresh
-- under the new per-agent model rather than trying to migrate it.
delete from billing_accounts;

alter table billing_accounts
  drop constraint billing_accounts_pkey;

alter table billing_accounts
  alter column id set default gen_random_uuid(),
  add column agent_id uuid references sales_agents(id) on delete cascade;

alter table billing_accounts
  alter column agent_id set not null,
  add constraint billing_accounts_pkey primary key (id),
  add constraint billing_accounts_agent_id_key unique (agent_id);

create index billing_accounts_agent_id_idx on billing_accounts (agent_id);

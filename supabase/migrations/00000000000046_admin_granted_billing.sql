-- Lets an admin unlock a plan for an agent for free, with no Stripe
-- subscription behind it at all — see lib/billing.ts::grantFreePlan. This is
-- a stopgap for the pre-launch period before real paying users exist; the
-- plan is to remove this whole escape hatch once it does.
alter table billing_accounts
  add column granted_by_admin boolean not null default false;

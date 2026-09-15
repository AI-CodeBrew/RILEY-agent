-- Three plans instead of two: adds a 7-day free-trial tier alongside
-- Standard and With Calendar. See lib/billing.ts.
--
-- `trial_used` blocks an agent from ever starting a second free trial once
-- their first one has actually completed checkout (set by the webhook's
-- syncSubscription, not at checkout-session creation, so an abandoned
-- checkout doesn't burn their one shot).
--
-- `trial_ends_at` is synced from Stripe's own `subscription.trial_end` —
-- fixed at subscription creation and never moves on renewal, unlike
-- `current_period_end` (which jumps forward every time a $0/mo trial
-- subscription auto-renews after the trial lapses). Gating on
-- `current_period_end` instead would wrongly re-unblock an expired trial
-- once Stripe's own renewal webhook lands.
alter table billing_accounts
  drop constraint billing_accounts_plan_check,
  add constraint billing_accounts_plan_check
    check (plan in ('trial', 'standard', 'with_calendar'));

alter table billing_accounts
  add column trial_used boolean not null default false,
  add column trial_ends_at timestamptz;

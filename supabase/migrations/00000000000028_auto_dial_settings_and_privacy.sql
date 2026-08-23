-- Auto-dial settings overhaul: multiple recurring dial schedules per agent,
-- a two-tier retry model (immediate attempts within a cycle vs. a longer
-- delay before another cycle, capped by a max number of days), a
-- configurable ring timeout and inter-call delay, and `customer_since` for
-- the bot to reference on calls. See the ticket for the full spec; this
-- migration only adds columns/tables, no drops — existing rows keep working
-- under the old flat retry semantics until resolve-call-outcome.ts (deployed
-- separately as an Edge Function) starts using the new fields.

-- 1. Recurring dial schedules — replaces "treat the campaign's
-- window_start/window_end as a recurring daily slot" (see
-- 00000000000019_retry_window_from_campaign.sql) as the source of truth for
-- when auto-dialing (campaigns and retries alike) is allowed to run.
create table if not exists agent_dial_schedules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references sales_agents (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  -- 0=Sunday .. 6=Saturday, matching JS Date#getDay() / Intl weekday parts.
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_dial_schedules_time_check check (end_time <> start_time)
);

create index if not exists agent_dial_schedules_agent_active_idx
  on agent_dial_schedules (agent_id, is_active);

alter table agent_dial_schedules enable row level security;

create policy "service role full access - agent_dial_schedules" on agent_dial_schedules
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. Call-cadence settings, alongside the existing retry_delay_minutes /
-- retry_max_attempts (both reused below with narrowed, per-cycle meaning
-- instead of lifetime).
alter table sales_agents
  add column if not exists ring_timeout_seconds int not null default 30
    check (ring_timeout_seconds in (30, 40, 50)),
  add column if not exists call_gap_seconds int not null default 60
    check (call_gap_seconds >= 0),
  add column if not exists retry_cycle_delay_minutes int not null default 60
    check (retry_cycle_delay_minutes > 0),
  add column if not exists retry_max_days int not null default 4
    check (retry_max_days > 0);

comment on column sales_agents.retry_delay_minutes is
  'Delay between immediate-retry attempts within one retry cycle (was: delay between every retry, before the two-tier model).';
comment on column sales_agents.retry_max_attempts is
  'Max immediate-retry attempts per cycle before backing off to retry_cycle_delay_minutes (was: lifetime cap across all retries).';
comment on column sales_agents.ring_timeout_seconds is
  'How long to let an outbound call ring before hanging up and treating it as no_answer. Enforced by reconcile-live-calls polling Vapi — no native ring-timeout param exists on Vapi''s call API.';
comment on column sales_agents.call_gap_seconds is
  'Default gap between dialing different customers in a new auto-dial campaign (dial_campaigns.gap_seconds) — see app/api/campaigns/route.ts.';

-- 3. Retry-cycle tracking + customer_since.
alter table customers
  add column if not exists retry_cycle_started_at timestamptz,
  add column if not exists customer_since date;

comment on column customers.retry_cycle_started_at is
  'When the current run of follow_up/no_answer retry cycles began. Anchors retry_max_days; cleared whenever a fresh non-retry outcome lands, so the next cycle starts from zero.';
comment on column customers.retry_count is
  'Attempts used in the *current* retry cycle (resets to 0 when a cycle exhausts retry_max_attempts and backs off, or when a non-retry outcome clears the whole chain) — was a lifetime counter before the two-tier retry model.';
comment on column customers.customer_since is
  'When this person became a client — read out by the bot (e.g. "you''ve been a client since January 2021"). Nullable: not every existing customer has this on file.';

-- 4. Tighten reconcile-live-calls' cron interval so ring-timeout enforcement
-- (added in the reconcile-live-calls Edge Function itself) is actually close
-- to the configured 30/40/50s, not bounded by the old 7-minute cadence.
-- Supabase's pg_cron supports sub-minute interval scheduling ('N seconds')
-- on top of the pg_cron/pg_net extensions already enabled by
-- 00000000000010_reconcile_live_calls_cron.sql. This remains an
-- approximation (poll interval + Vapi round-trip + network jitter), not an
-- exact cutoff — same as real-world ring duration already varying by
-- carrier, per the ticket's own framing.
select cron.unschedule('reconcile-live-calls');

select cron.schedule(
  'reconcile-live-calls',
  '15 seconds',
  $$
  select net.http_post(
    url := 'https://oznfpovlmpokkoslrnti.supabase.co/functions/v1/reconcile-live-calls',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reconcile_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

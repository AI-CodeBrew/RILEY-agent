import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BillingAccount, BillingPlan } from "@/types/database";

/** Included calls per month for each paid plan, before an agent's calls stop — no overage billing, calls just stop. Paid plans are capped by number of calls placed, not by minutes; only the trial is still measured in minutes. */
export const PLAN_CALL_CAP: Record<"standard" | "with_calendar", number> = {
  standard: 3000,
  with_calendar: 4200,
};
/** Included call time for the entire 7-day free trial — much smaller than a paid plan's monthly cap, by design. */
export const TRIAL_MINUTE_CAP = 20;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

/** Stripe Price id for each plan — set once the three Prices exist in the Stripe dashboard. */
export function priceIdForPlan(plan: BillingPlan): string {
  if (plan === "trial") return requireEnv("STRIPE_PRICE_TRIAL");
  return plan === "with_calendar"
    ? requireEnv("STRIPE_PRICE_WITH_CALENDAR")
    : requireEnv("STRIPE_PRICE_STANDARD");
}

/** Reverse lookup used by the webhook handler, which only gets a price id back from Stripe. */
export function planForPriceId(priceId: string): BillingPlan | null {
  if (priceId === process.env.STRIPE_PRICE_TRIAL) return "trial";
  if (priceId === process.env.STRIPE_PRICE_STANDARD) return "standard";
  if (priceId === process.env.STRIPE_PRICE_WITH_CALENDAR) return "with_calendar";
  return null;
}

/** Only Pro (with_calendar) and the trial, which includes everything, can use the Calendar module — Standard excludes it. Admins aren't gated here; that's handled separately since they have no billing row at all. */
export function planIncludesCalendar(plan: BillingPlan | null): boolean {
  return plan !== "standard";
}

/** This agent's own billing row, or null if they've never started a subscription. */
export async function getBillingAccount(agentId: string): Promise<BillingAccount | null> {
  const { data } = await supabaseAdmin
    .from("billing_accounts")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  return data;
}

/** Seconds of call time this agent has logged since their current subscription period started. Falls back to a rolling 30 days when there's no active period to anchor to (no subscription yet). */
export async function secondsUsedThisPeriod(account: BillingAccount): Promise<number> {
  const periodStart =
    account.current_period_start ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("calls")
    .select("duration_seconds")
    .eq("agent_id", account.agent_id)
    .gte("created_at", periodStart);

  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0);
}

/** Calls this agent has placed since their current subscription period started — what the paid plans' PLAN_CALL_CAP is measured against. Every call that was actually dialled counts, answered or not; one still waiting in "scheduled" hasn't dialled yet, so it doesn't. Same rolling-30-days fallback as secondsUsedThisPeriod. */
export async function callsUsedThisPeriod(account: BillingAccount): Promise<number> {
  const periodStart =
    account.current_period_start ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", account.agent_id)
    .neq("status", "scheduled")
    .gte("created_at", periodStart);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Gate for app/api/calls/trigger/route.ts — checks the *calling* agent's own
 * subscription, not the team's. A message means the call is blocked; null
 * means it's clear to place.
 */
export async function callBlockReason(agentId: string): Promise<string | null> {
  const account = await getBillingAccount(agentId);

  if (!account || account.status !== "active") {
    // A trial subscription is cancelled by Stripe when its 7 days are up (see
    // syncSubscription in app/api/stripe/webhook) and the row keeps
    // plan = "trial", so this is an ended trial rather than a lapsed paid plan.
    if (account?.plan === "trial" && account.trial_used) {
      return "Your 7-day free trial has ended — choose Standard or Pro from Settings to keep calling.";
    }
    return "You don't have an active subscription — subscribe from Settings before placing calls.";
  }

  // Backstop for a trial that outlived its 7 days while still "active" —
  // one started before trials were set to cancel themselves, or whose
  // cancellation webhook hasn't landed yet. Status alone can't tell a live
  // trial from an expired one there, so trial_ends_at (fixed at creation,
  // unlike current_period_end) is the real cutoff.
  if (account.plan === "trial" && account.trial_ends_at && new Date(account.trial_ends_at) <= new Date()) {
    return "Your 7-day free trial has ended — choose Standard or Pro from Settings to keep calling.";
  }

  const plan = account.plan ?? "standard";
  if (plan === "trial") {
    const usedSeconds = await secondsUsedThisPeriod(account);
    return usedSeconds >= TRIAL_MINUTE_CAP * 60
      ? `You've used your ${TRIAL_MINUTE_CAP} free trial minutes — choose Standard or Pro from Settings to keep calling.`
      : null;
  }

  const usedCalls = await callsUsedThisPeriod(account);
  if (usedCalls >= PLAN_CALL_CAP[plan]) {
    return `You've used your ${PLAN_CALL_CAP[plan]} included calls for this billing period.`;
  }

  return null;
}

/**
 * Admin-only escape hatch: unlocks a plan for an agent for free, with no
 * Stripe customer/subscription behind it at all. Pre-launch stopgap for
 * giving internal/test agents access before there are real paying users —
 * meant to be deleted once it does (see app/api/billing/admin-grant/route.ts).
 */
export async function grantFreePlan(agentId: string, plan: BillingPlan): Promise<void> {
  const existing = await getBillingAccount(agentId);

  if (!existing) {
    const { error } = await supabaseAdmin.from("billing_accounts").insert({
      agent_id: agentId,
      plan,
      status: "active",
      granted_by_admin: true,
    });
    if (error) throw new Error(`Could not grant free plan: ${error.message}`);
    return;
  }

  const { error } = await supabaseAdmin
    .from("billing_accounts")
    .update({
      plan,
      status: "active",
      granted_by_admin: true,
      // A free grant has no real trial behind it — never let a stale
      // trial_ends_at from a prior real trial subscription block calls.
      trial_ends_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);
  if (error) throw new Error(`Could not grant free plan: ${error.message}`);
}

/** Undoes grantFreePlan — the agent goes back to having no active subscription until they (or an admin) set one up again. */
export async function revokeFreePlan(agentId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("billing_accounts")
    .update({
      status: "canceled",
      granted_by_admin: false,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);
  if (error) throw new Error(`Could not revoke free plan: ${error.message}`);
}

/**
 * Every agent's billing row (or lack of one) plus their usage this period —
 * powers the admin's read-only billing overview on Settings. Admins never
 * manage or see a customer/subscription id here, only the same status/plan/
 * usage an agent sees for themselves.
 */
export async function listBillingOverview(): Promise<
  Array<{
    agent: { id: string; name: string; email: string };
    account: BillingAccount | null;
    usedHours: number;
    usedCalls: number;
  }>
> {
  const [{ data: agents }, { data: accounts }] = await Promise.all([
    supabaseAdmin
      .from("sales_agents")
      .select("id, name, email")
      .eq("role", "agent")
      .order("name"),
    supabaseAdmin.from("billing_accounts").select("*"),
  ]);

  const accountByAgentId = new Map(
    (accounts ?? []).map((account) => [account.agent_id, account])
  );

  return Promise.all(
    (agents ?? []).map(async (agent) => {
      const account = accountByAgentId.get(agent.id) ?? null;
      const [usedSeconds, usedCalls] = account
        ? await Promise.all([secondsUsedThisPeriod(account), callsUsedThisPeriod(account)])
        : [0, 0];
      return { agent, account, usedHours: usedSeconds / 3600, usedCalls };
    })
  );
}

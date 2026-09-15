import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BillingAccount, BillingPlan } from "@/types/database";

/** Included call minutes per month for each paid plan, before an agent's calls stop — no overage billing, calls just stop. Standard and Pro (with_calendar) get different amounts, unlike the old shared cap. */
export const PLAN_MINUTE_CAP: Record<"standard" | "with_calendar", number> = {
  standard: 3000,
  with_calendar: 4000,
};
/** Included call time for the entire 7-day free trial — much smaller than a paid plan's monthly cap, by design. */
export const TRIAL_MINUTE_CAP = 20;

/** Seconds-of-call-time cap per plan — trial is minutes total for the trial, paid plans are minutes per billing period. */
const SECOND_CAP: Record<BillingPlan, number> = {
  trial: TRIAL_MINUTE_CAP * 60,
  standard: PLAN_MINUTE_CAP.standard * 60,
  with_calendar: PLAN_MINUTE_CAP.with_calendar * 60,
};

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

/**
 * Gate for app/api/calls/trigger/route.ts — checks the *calling* agent's own
 * subscription, not the team's. A message means the call is blocked; null
 * means it's clear to place.
 */
export async function callBlockReason(agentId: string): Promise<string | null> {
  const account = await getBillingAccount(agentId);

  if (!account || account.status !== "active") {
    return "You don't have an active subscription — subscribe from Settings before placing calls.";
  }

  // A $0/mo trial subscription stays "active" in Stripe forever once the
  // trial period lapses (it just keeps auto-renewing at $0) — status alone
  // can't tell a live trial from an expired one, so trial_ends_at (fixed at
  // creation, unlike current_period_end) is the real cutoff.
  if (account.plan === "trial" && account.trial_ends_at && new Date(account.trial_ends_at) <= new Date()) {
    return "Your 7-day free trial has ended — choose Standard or Pro from Settings to keep calling.";
  }

  const plan = account.plan ?? "standard";
  const used = await secondsUsedThisPeriod(account);
  if (used >= SECOND_CAP[plan]) {
    return account.plan === "trial"
      ? `You've used your ${TRIAL_MINUTE_CAP} free trial minutes — choose Standard or Pro from Settings to keep calling.`
      : `You've used your ${SECOND_CAP[plan] / 60} included call minutes for this billing period.`;
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
      const usedHours = account ? (await secondsUsedThisPeriod(account)) / 3600 : 0;
      return { agent, account, usedHours };
    })
  );
}

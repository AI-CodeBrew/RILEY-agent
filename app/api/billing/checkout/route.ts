import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { getBillingAccount, priceIdForPlan } from "@/lib/billing";
import type { BillingPlan } from "@/types/database";

const PLANS: BillingPlan[] = ["trial", "standard", "with_calendar"];

/** Stripe's own trial-period mechanic — the price itself is $0, but this is what actually makes Checkout mark the subscription "trialing" and stamps subscription.trial_end, which is what callBlockReason's 7-day cutoff reads back. */
const TRIAL_DAYS = 7;

/**
 * Starts a Stripe Checkout session for the *calling agent's own*
 * subscription — each agent pays for and owns their own calling, not the
 * whole team sharing one account. Agent-only: admins observe the account,
 * they never place calls themselves, so there's nothing for them to
 * subscribe to (see requireApiSession's agentOnly). The price is looked up
 * server-side from the plan name; the client never gets to pass a price id
 * or amount directly.
 *
 * Three plans: `trial` (7 days, 20 minutes, everything included, one-time —
 * see the trial_used check below), `standard` ($5/mo, everything except
 * Calendar), `with_calendar` ($10/mo, everything). trial_used and
 * trial_ends_at only get written by the webhook once a trial checkout
 * actually completes (see app/api/stripe/webhook), not here — an abandoned
 * checkout shouldn't burn an agent's one free trial.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;
  const agent = auth.session.agent;

  const { plan } = await request.json().catch(() => ({}));
  if (!PLANS.includes(plan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  let account = await getBillingAccount(agent.id);
  if (account?.status === "active") {
    return NextResponse.json(
      { error: "You already have an active subscription — use the manage-billing link to change plans." },
      { status: 409 }
    );
  }
  if (plan === "trial" && account?.trial_used) {
    return NextResponse.json(
      { error: "You've already used your free trial — choose Standard or Pro instead." },
      { status: 409 }
    );
  }

  if (!account) {
    // First time this agent has ever started a subscription — their row
    // doesn't exist yet (unlike the old singleton, which the migration
    // pre-seeded once for the whole account). Claim it with a bare insert
    // *before* touching Stripe: `agent_id` is unique, so a double-click
    // firing two of these requests at once has the second insert fail here
    // and fall through to re-fetching the first request's row below —
    // rather than both requests independently creating their own Stripe
    // customer and racing to save it, which would leave whichever one lost
    // referencing a customer id this table never ends up storing (so its
    // checkout would complete but the webhook could never find a row to
    // update).
    await supabaseAdmin.from("billing_accounts").insert({ agent_id: agent.id });
    // Re-fetch regardless of whether our own insert landed or lost the
    // unique-constraint race — either way the row now exists, and this
    // reads back whichever one actually won.
    account = await getBillingAccount(agent.id);
  }

  let customerId = account?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: agent.email,
      name: agent.name,
    });
    customerId = customer.id;
    await supabaseAdmin
      .from("billing_accounts")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("agent_id", agent.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForPlan(plan as BillingPlan), quantity: 1 }],
    // Checkout always collects a payment method for subscription mode by
    // default (we never set payment_method_collection: "if_required") —
    // that's what makes a card required even for this $0 trial.
    subscription_data: plan === "trial" ? { trial_period_days: TRIAL_DAYS } : undefined,
    success_url: new URL("/settings?tab=profile&billing=success", request.url).toString(),
    cancel_url: new URL("/plans?billing=canceled", request.url).toString(),
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a checkout URL." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}

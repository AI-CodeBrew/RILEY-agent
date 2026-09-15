import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { planForPriceId } from "@/lib/billing";
import type { BillingStatus } from "@/types/database";

/**
 * Public by necessity — Stripe, not a signed-in user, calls this. Every
 * request must carry a signature over the *raw* body proving it came from
 * Stripe; without that check, anyone could POST a fake
 * "checkout.session.completed" and switch some agent's billing to "active"
 * for free. proxy.ts already excludes all of /api/ from the session/auth
 * proxy (see the matcher comment there), so this route is reachable with no
 * cookies involved — the signature check below is the actual gate.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  // Must be the untouched raw body — request.json() would re-serialize it
  // and break the signature check.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Stripe retries deliveries; recording the event id first (and bailing on
  // conflict) makes the handler idempotent even if two deliveries race.
  const { error: insertError } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type });
  if (insertError) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        await syncSubscription(session.subscription);
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription.id);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(subscription.customer);
      if (customerId) await updateByCustomerId(customerId, { status: "canceled" });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(invoice.customer);
      if (customerId) await updateByCustomerId(customerId, { status: "past_due" });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

const STATUS_MAP: Record<Stripe.Subscription.Status, BillingStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  canceled: "canceled",
  paused: "canceled",
};

/** Stripe fields typed `string | Stripe.Customer | Stripe.DeletedCustomer | null` — only ever a string here in practice (we never `expand` these), but this narrows either way. */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Every billing row is looked up by `stripe_customer_id` rather than a
 * caller-supplied agent id — that id is stable for the life of an agent's
 * Stripe customer (created once, in app/api/billing/checkout), so it's the
 * one thing every subscription/invoice event reliably carries back,
 * independent of which agent that customer belongs to.
 */
async function updateByCustomerId(customerId: string, fields: Record<string, unknown>) {
  await supabaseAdmin
    .from("billing_accounts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId);
}

async function syncSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  const plan = item ? planForPriceId(item.price.id) : null;
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return;

  const fields: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    plan,
    status: STATUS_MAP[subscription.status] ?? "incomplete",
    // A real Stripe subscription is now the source of truth for this row —
    // clears any earlier admin free-grant flag (lib/billing.ts::grantFreePlan)
    // so the UI stops showing it as free once real billing takes over.
    granted_by_admin: false,
    current_period_start: item
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
  };

  // trial_end is fixed at subscription creation and doesn't move on later
  // renewals, so it's safe to just keep re-syncing it verbatim — unlike
  // current_period_end (see the trial_ends_at doc comment in
  // 00000000000045_billing_plans_and_trial.sql). trial_used is set here,
  // not at checkout-session creation, so an abandoned checkout never burns
  // an agent's one free trial — and it's only ever set to `true`, never
  // written back to `false` here, so it stays true for good even once this
  // agent later moves off the trial plan onto a paid one.
  if (plan === "trial") {
    fields.trial_used = true;
    fields.trial_ends_at = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;
  }

  await updateByCustomerId(customerId, fields);
}

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireApiSession } from "@/lib/auth";
import { getBillingAccount } from "@/lib/billing";

/** Hands the calling agent off to Stripe's hosted "manage my subscription" page for their own subscription — update card, view invoices, cancel. No card data or plan logic needs to live in this app. */
export async function POST(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const account = await getBillingAccount(auth.session.agent.id);
  if (!account?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: new URL("/settings", request.url).toString(),
  });

  return NextResponse.json({ url: session.url });
}

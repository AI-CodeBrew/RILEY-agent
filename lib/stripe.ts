import Stripe from "stripe";

/**
 * Server-only Stripe client, same shape as supabase-admin.ts. The secret key
 * can create charges and read every customer on the account — it must never
 * reach the browser or a Client Component.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/stripe.ts must never be imported in browser/client code.");
}

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
}

export const stripe = new Stripe(secretKey);

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { getBillingAccount } from "@/lib/billing";
import {
  GENDER_LABELS,
  LICENSE_REGIONS,
  MAX_BUDGET_CENTS,
  MIN_BUDGET_CENTS,
  PRODUCT_LABELS,
  formatCents,
} from "@/lib/lead-gen";
import type { LeadGenGender, LeadGenProduct } from "@/types/database";

function optionalAge(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const age = Number(value);
  return Number.isInteger(age) && age >= 18 && age <= 100 ? age : "invalid";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Dollars as typed ("250", "250.50") → cents, or null when it isn't a price. */
function budgetCents(value: unknown): number | null {
  const dollars = Number(typeof value === "string" ? value.replace(/[$,\s]/g, "") : value);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/**
 * Places a lead-gen order and starts a one-time Stripe Checkout for it.
 * Agent-only, same as billing checkout: admins don't buy anything, they take
 * paid orders live (see [id]/route.ts). The order row is written first as
 * pending_payment so the webhook has something to mark paid; an abandoned
 * checkout just leaves it pending. Stripe charges exactly the budget the
 * agent typed, after it's checked against MIN/MAX_BUDGET_CENTS here.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;
  const agent = auth.session.agent;

  const body = await request.json().catch(() => ({}));

  if (typeof body.product !== "string" || !(body.product in PRODUCT_LABELS)) {
    return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  }
  const product = body.product as LeadGenProduct;

  const licensedRegions = Array.isArray(body.licensed_regions)
    ? LICENSE_REGIONS.map((r) => r.code).filter((code) => body.licensed_regions.includes(code))
    : [];
  if (licensedRegions.length === 0) {
    return NextResponse.json({ error: "Choose at least one province or state you're licensed in." }, { status: 400 });
  }

  const ageMin = optionalAge(body.age_min);
  const ageMax = optionalAge(body.age_max);
  if (ageMin === "invalid" || ageMax === "invalid") {
    return NextResponse.json({ error: "Ages must be whole numbers between 18 and 100." }, { status: 400 });
  }
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    return NextResponse.json({ error: "Minimum age can't be above maximum age." }, { status: 400 });
  }

  const amountCents = budgetCents(body.budget);
  if (amountCents === null || amountCents < MIN_BUDGET_CENTS || amountCents > MAX_BUDGET_CENTS) {
    return NextResponse.json(
      { error: `Budget must be between ${formatCents(MIN_BUDGET_CENTS)} and ${formatCents(MAX_BUDGET_CENTS)}.` },
      { status: 400 }
    );
  }

  const gender: LeadGenGender =
    typeof body.gender === "string" && body.gender in GENDER_LABELS ? (body.gender as LeadGenGender) : "any";

  const { data: order, error } = await supabaseAdmin
    .from("lead_gen_orders")
    .insert({
      agent_id: agent.id,
      product,
      cities: optionalText(body.location),
      gender,
      age_min: ageMin,
      age_max: ageMax,
      licensed_regions: licensedRegions,
      agency_name: optionalText(body.agency_name) ?? agent.name,
      amount_cents: amountCents,
    })
    .select("id")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: `Couldn't save the order: ${error?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  // Reuse the agent's subscription customer when they have one, so both
  // charges show up under the same customer in Stripe.
  const account = await getBillingAccount(agent.id);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(account?.stripe_customer_id
      ? { customer: account.stripe_customer_id }
      : { customer_email: agent.email }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: amountCents,
          product_data: { name: `Lead gen — ${PRODUCT_LABELS[product]}` },
        },
      },
    ],
    metadata: { lead_gen_order_id: order.id },
    success_url: new URL("/lead-gen?order=success", request.url).toString(),
    cancel_url: new URL("/lead-gen?order=canceled", request.url).toString(),
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a checkout URL." }, { status: 502 });
  }

  await supabaseAdmin
    .from("lead_gen_orders")
    .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", order.id);

  return NextResponse.json({ url: session.url });
}

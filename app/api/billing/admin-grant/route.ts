import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBillingAccount, grantFreePlan, revokeFreePlan } from "@/lib/billing";
import type { BillingPlan } from "@/types/database";

const PLANS: BillingPlan[] = ["trial", "standard", "with_calendar"];

/**
 * Admin-only free-plan grant — bypasses Stripe entirely. Pre-launch stopgap
 * so an admin can unlock calling for an agent without them paying anything;
 * see lib/billing.ts::grantFreePlan for why. Won't clobber a real paid
 * subscription that's already active.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { agentId, plan } = await request.json().catch(() => ({}));
  if (typeof agentId !== "string" || !agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  if (!PLANS.includes(plan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("id, role")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent || agent.role !== "agent") {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  const existing = await getBillingAccount(agentId);
  if (existing?.status === "active" && existing.stripe_subscription_id && !existing.granted_by_admin) {
    return NextResponse.json(
      {
        error:
          "This agent already has a real paid subscription — cancel it in Stripe before granting a free plan.",
      },
      { status: 409 }
    );
  }

  try {
    await grantFreePlan(agentId, plan as BillingPlan);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not grant free plan." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { agentId } = await request.json().catch(() => ({}));
  if (typeof agentId !== "string" || !agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    await revokeFreePlan(agentId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not revoke free plan." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

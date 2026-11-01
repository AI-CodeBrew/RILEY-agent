import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/**
 * Admin-only: moves a paid lead-gen order to "live" (the team has set the
 * campaign up) or cancels it. Only a paid order can go live — an unpaid one
 * is still waiting on Stripe.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { status } = await request.json().catch(() => ({}));
  if (status !== "live" && status !== "canceled") {
    return NextResponse.json({ error: "status must be live or canceled" }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from("lead_gen_orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (status === "live" && order.status !== "paid") {
    return NextResponse.json({ error: "Only a paid order can go live." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("lead_gen_orders")
    .update({ status, updated_at: now, ...(status === "live" ? { live_at: now } : {}) })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

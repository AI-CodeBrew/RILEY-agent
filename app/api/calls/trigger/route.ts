import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerCallForCustomer } from "@/lib/trigger-call";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import type { Customer } from "@/types/database";

export async function POST(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { customer_id, scheduled_for } = body ?? {};

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }

  const authorized = await authorizeRow<Customer>("customers", customer_id, auth.session);
  if ("error" in authorized) return authorized.error;
  const customer = authorized.row;

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", auth.session.agent.id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  try {
    const result = await triggerCallForCustomer({
      customer,
      agent,
      triggeredBy: auth.session.agent.id,
      scheduledFor: scheduled_for || null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start call" },
      { status: err instanceof Error && err.message.includes("do-not-call") ? 409 : 502 }
    );
  }
}

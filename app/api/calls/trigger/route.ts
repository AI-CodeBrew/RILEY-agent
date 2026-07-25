import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { triggerOutboundCall } from "@/lib/vapi";

export async function POST(request: Request) {
  const body = await request.json();
  const { customer_id, agent_id } = body ?? {};

  if (!customer_id || !agent_id) {
    return NextResponse.json(
      { error: "customer_id and agent_id are required" },
      { status: 400 }
    );
  }

  const [{ data: customer, error: customerError }, { data: agent, error: agentError }] =
    await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", customer_id).single(),
      supabaseAdmin.from("sales_agents").select("*").eq("id", agent_id).single(),
    ]);

  if (customerError || !customer) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  let vapiCall;
  try {
    vapiCall = await triggerOutboundCall({
      customerName: customer.name,
      customerPhone: customer.phone,
      customerId: customer.id,
      agentId: agent.id,
      agentName: agent.name,
      phoneNumberId: agent.vapi_phone_number_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start call" },
      { status: 502 }
    );
  }

  const [{ error: callInsertError }] = await Promise.all([
    supabaseAdmin.from("calls").insert({
      customer_id: customer.id,
      agent_id: agent.id,
      vapi_call_id: vapiCall.id,
    }),
    supabaseAdmin
      .from("customers")
      .update({ status: "calling" })
      .eq("id", customer.id),
  ]);

  if (callInsertError) {
    return NextResponse.json({ error: callInsertError.message }, { status: 500 });
  }

  return NextResponse.json({ call: vapiCall }, { status: 201 });
}

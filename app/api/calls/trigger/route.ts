import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toCallStatus, triggerOutboundCall } from "@/lib/vapi";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { LIVE_CALL_STATUSES, type Customer } from "@/types/database";

export async function POST(request: Request) {
  // Riley dials from the agent's own number and books into their own
  // Calendly, so only an agent can start a call. Admins have neither.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { customer_id, scheduled_for } = body ?? {};

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }

  const authorized = await authorizeRow<Customer>(
    "customers",
    customer_id,
    auth.session
  );
  if ("error" in authorized) return authorized.error;
  const customer = authorized.row;

  if (customer.status === "do_not_call") {
    return NextResponse.json(
      { error: `${customer.name} is marked do-not-call.` },
      { status: 409 }
    );
  }

  // The call is placed on behalf of an agent — their Calendly gets booked and
  // their number shows on the customer's phone. Agents only ever call as
  // themselves.
  const callingAgentId = auth.session.agent.id;

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", callingAgentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  // One live call per customer — a second one would talk over the first and
  // both would race to book the same slot.
  const { data: liveCalls } = await supabaseAdmin
    .from("calls")
    .select("id, status")
    .eq("customer_id", customer.id)
    .in("status", [...LIVE_CALL_STATUSES]);

  if (liveCalls && liveCalls.length > 0) {
    return NextResponse.json(
      { error: "There's already a call in progress or queued for this customer." },
      { status: 409 }
    );
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
      scheduledFor: scheduled_for || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start call" },
      { status: 502 }
    );
  }

  const status = scheduled_for ? "scheduled" : toCallStatus(vapiCall.status);

  const { data: call, error: callInsertError } = await supabaseAdmin
    .from("calls")
    .insert({
      customer_id: customer.id,
      agent_id: agent.id,
      triggered_by: auth.session.agent.id,
      vapi_call_id: vapiCall.id,
      // Captured now because the control URL is how the portal hangs up
      // mid-call; it isn't retrievable after the call ends.
      control_url: vapiCall.monitor?.controlUrl ?? null,
      status,
      scheduled_for: scheduled_for || null,
    })
    .select("*")
    .single();

  await supabaseAdmin
    .from("customers")
    .update({
      status: scheduled_for ? "call_scheduled" : "calling",
      last_contacted_at: scheduled_for ? customer.last_contacted_at : new Date().toISOString(),
    })
    .eq("id", customer.id);

  if (callInsertError) {
    return NextResponse.json({ error: callInsertError.message }, { status: 500 });
  }

  return NextResponse.json({ call, vapi_call: vapiCall }, { status: 201 });
}

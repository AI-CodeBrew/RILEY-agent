import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toE164 } from "@/lib/format";
import { ORDER_ACCEPTS_LEADS, consentTexts } from "@/lib/lead-gen";
import { appendSheetRow, getValidAccessToken } from "@/lib/google-sheets";
import type { GoogleSheetConnection } from "@/types/database";

/**
 * Hands the lead to the agent's connected Google Sheet, in the columns they
 * mapped in Settings. The sheet poller (app/api/cron/process-sheet-leads)
 * then imports the row as a customer and the auto-dialer calls it, exactly
 * like a lead from their ads. No connected, mapped sheet → the lead just
 * stays on the Leads Gen page. Failures are logged, never shown to the lead:
 * their request is already saved.
 */
async function sendToAgentSheet(
  agentId: string,
  lead: { firstName: string; lastName: string; phone: string; email: string }
) {
  const { data } = await supabaseAdmin
    .from("google_sheet_connections")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "connected")
    .maybeSingle();
  const connection = data as GoogleSheetConnection | null;
  if (!connection?.google_refresh_token || !connection.spreadsheet_id || !connection.phone_column) return;
  if (!connection.name_column && !connection.first_name_column && !connection.last_name_column) return;

  const cells: Record<string, string> = { [connection.phone_column]: lead.phone };
  if (connection.name_column) cells[connection.name_column] = `${lead.firstName} ${lead.lastName}`;
  if (connection.first_name_column) cells[connection.first_name_column] = lead.firstName;
  if (connection.last_name_column) cells[connection.last_name_column] = lead.lastName;
  if (connection.email_column) cells[connection.email_column] = lead.email;

  try {
    const accessToken = await getValidAccessToken(connection.google_refresh_token);
    await appendSheetRow(connection.spreadsheet_id, cells, accessToken);
  } catch (err) {
    console.error(`lead-gen: couldn't add lead to agent ${agentId}'s sheet:`, err instanceof Error ? err.message : err);
  }
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

/**
 * Unauthenticated by design — the public lead form at /quote/<order id>.
 * Only paid or live orders take leads. The consent wording is rebuilt here
 * from the order (never taken from the client) and stored with the lead, so
 * the record shows exactly what the person agreed to.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  // Honeypot: a field hidden from people that bots tend to fill in. Pretend
  // it worked so they don't retry.
  if (typeof body.website === "string" && body.website) {
    return NextResponse.json({ ok: true });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const { data: order } = await supabaseAdmin
    .from("lead_gen_orders")
    .select("id, agent_id, status, agency_name, licensed_regions, agent:sales_agents(name)")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !ORDER_ACCEPTS_LEADS[order.status as keyof typeof ORDER_ACCEPTS_LEADS]) {
    return NextResponse.json({ error: "This form is no longer accepting requests." }, { status: 404 });
  }

  const firstName = requiredText(body.first_name);
  const lastName = requiredText(body.last_name);
  const email = requiredText(body.email);
  const phone = typeof body.phone === "string" ? toE164(body.phone) : null;

  if (!firstName || !lastName || !email || !body.phone) {
    return NextResponse.json({ error: "First name, last name, phone and email are required." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (body.consent_calls !== true) {
    return NextResponse.json({ error: "Please tick the box agreeing to be called." }, { status: 400 });
  }

  const agent = order.agent as unknown as { name: string } | null;
  const consent = consentTexts(order, agent?.name ?? "your agent");

  const { error } = await supabaseAdmin.from("lead_gen_leads").insert({
    order_id: order.id,
    agent_id: order.agent_id,
    first_name: firstName,
    last_name: lastName,
    phone,
    email,
    consent_calls: true,
    consent_messages: body.consent_messages === true,
    consent_calls_text: consent.calls,
    consent_messages_text: consent.messages,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: request.headers.get("user-agent"),
  });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't send your request right now — please try again shortly." },
      { status: 502 }
    );
  }

  await sendToAgentSheet(order.agent_id, { firstName, lastName, phone, email });

  return NextResponse.json({ ok: true });
}

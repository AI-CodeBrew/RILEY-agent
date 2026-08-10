import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { parseKitCount, toE164 } from "@/lib/format";

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const requestedAgentId =
    new URL(request.url).searchParams.get("agent") ?? undefined;

  const query = applyAgentScope(
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name, email)")
      .order("created_at", { ascending: false }),
    auth.session,
    { requestedAgentId }
  );

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data });
}

export async function POST(request: Request) {
  // Customers belong to the agent who works them; admins are read-only.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const {
    name,
    phone,
    email,
    company,
    notes,
    province,
    timezone,
    kit_count,
    mailing_address,
    request_date,
    date_of_birth,
    beneficiary_name,
  } = body ?? {};

  if (!name || !phone) {
    return NextResponse.json(
      { error: "name and phone are required" },
      { status: 400 }
    );
  }

  const normalizedPhone = toE164(phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      {
        error: `"${phone}" isn't a callable number — use +country format (e.g. +923001234567, +447911123456) or local format with a leading 0.`,
      },
      { status: 400 }
    );
  }

  const kitCount = parseKitCount(kit_count);
  if (kitCount === "invalid") {
    return NextResponse.json(
      { error: "kit_count must be a whole number between 1 and 10" },
      { status: 400 }
    );
  }

  const customerTimezone = parseCanadaTimezoneInput(timezone);
  if (customerTimezone === "invalid") {
    return NextResponse.json(
      { error: "Time zone must be Atlantic, Eastern, Mountain, or Pacific." },
      { status: 400 }
    );
  }

  const ownerId = auth.session.agent.id;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      name,
      phone: normalizedPhone,
      email: email || null,
      company: company || null,
      notes: notes || null,
      // Will-kit campaign details. Left null when unknown — Riley asks for
      // anything that isn't on the record rather than asserting it.
      province: province || null,
      timezone: customerTimezone,
      kit_count: kitCount,
      mailing_address: mailing_address || null,
      request_date: request_date || null,
      date_of_birth: date_of_birth || null,
      beneficiary_name: beneficiary_name || null,
      agent_id: ownerId,
    })
    .select("*, agent:sales_agents(id, name, email)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { redactCustomersForSession } from "@/lib/customer-visibility";
import { findDuplicateCustomer } from "@/lib/duplicate-check";
import { parseKitCount, toE164 } from "@/lib/format";
import { CALL_TYPES, type CallType } from "@/types/database";

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

  return NextResponse.json({ customers: redactCustomersForSession(data ?? [], auth.session) });
}

export async function POST(request: Request) {
  // Customers belong to the agent who works them; admins are read-only.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const {
    name,
    first_name,
    middle_name,
    last_name,
    phone,
    home_telephone,
    cellular_phone,
    email,
    company,
    notes,
    province,
    city,
    postal_code,
    timezone,
    kit_count,
    mailing_address,
    request_date,
    date_of_birth,
    customer_since,
    beneficiary_name,
    relationship,
    shift,
    preferred_meeting_time,
    call_type,
    confirm_duplicate,
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

  if (call_type && !CALL_TYPES.includes(call_type)) {
    return NextResponse.json(
      { error: `call_type must be one of ${CALL_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!confirm_duplicate) {
    const duplicate = await findDuplicateCustomer({
      phone: normalizedPhone,
      email,
      session: auth.session,
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `A customer named "${duplicate.name}" already has this ${duplicate.field}.`,
          duplicate,
        },
        { status: 409 }
      );
    }
  }

  const ownerId = auth.session.agent.id;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      name,
      first_name: first_name || null,
      middle_name: middle_name || null,
      last_name: last_name || null,
      phone: normalizedPhone,
      home_telephone: home_telephone || null,
      cellular_phone: cellular_phone || null,
      email: email || null,
      company: company || null,
      notes: notes || null,
      // Will-kit campaign details. Left null when unknown — Riley asks for
      // anything that isn't on the record rather than asserting it.
      province: province || null,
      city: city || null,
      postal_code: postal_code || null,
      timezone: customerTimezone,
      kit_count: kitCount,
      mailing_address: mailing_address || null,
      request_date: request_date || null,
      date_of_birth: date_of_birth || null,
      customer_since: customer_since || null,
      beneficiary_name: beneficiary_name || null,
      relationship: relationship || null,
      shift: shift || null,
      preferred_meeting_time: preferred_meeting_time || null,
      call_type: (call_type || null) as CallType | null,
      agent_id: ownerId,
    })
    .select("*, agent:sales_agents(id, name, email)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}

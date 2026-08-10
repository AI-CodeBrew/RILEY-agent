import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { parseKitCount, toE164 } from "@/lib/format";
import type { Customer } from "@/types/database";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Customer>("customers", id, auth.session);
  if ("error" in authorized) return authorized.error;

  const body = await request.json().catch(() => ({}));
  const updates: Partial<Customer> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.company !== undefined) updates.company = body.company || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.status !== undefined) updates.status = body.status;

  // Will-kit campaign details Riley reads back on the call.
  if (body.province !== undefined) updates.province = body.province || null;
  if (body.timezone !== undefined) {
    const parsed = parseCanadaTimezoneInput(body.timezone);
    if (parsed === "invalid") {
      return NextResponse.json(
        { error: "Time zone must be Atlantic, Eastern, Mountain, or Pacific." },
        { status: 400 }
      );
    }
    updates.timezone = parsed;
  }
  if (body.mailing_address !== undefined)
    updates.mailing_address = body.mailing_address || null;
  if (body.request_date !== undefined)
    updates.request_date = body.request_date || null;
  if (body.date_of_birth !== undefined)
    updates.date_of_birth = body.date_of_birth || null;
  if (body.beneficiary_name !== undefined)
    updates.beneficiary_name = body.beneficiary_name || null;

  if (body.kit_count !== undefined) {
    const kitCount = parseKitCount(body.kit_count);
    if (kitCount === "invalid") {
      return NextResponse.json(
        { error: "kit_count must be a whole number between 1 and 10" },
        { status: 400 }
      );
    }
    updates.kit_count = kitCount;
  }

  if (body.phone !== undefined) {
    const normalized = toE164(body.phone);
    if (!normalized) {
      return NextResponse.json(
        { error: `"${body.phone}" isn't a callable number.` },
        { status: 400 }
      );
    }
    updates.phone = normalized;
  }

  // Reassigning a customer to a different agent is an admin action — an
  // agent handing their own record to someone else would silently lose it.
  if (body.agent_id !== undefined) {
    if (!auth.session.isAdmin) {
      return NextResponse.json(
        { error: "only admins can reassign customers" },
        { status: 403 }
      );
    }
    updates.agent_id = body.agent_id || null;
  }

  const { data, error } = await supabaseAdmin
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select("*, agent:sales_agents(id, name, email)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Customer>("customers", id, auth.session);
  if ("error" in authorized) return authorized.error;

  // calls/appointments cascade with the customer (see the initial schema).
  const { error } = await supabaseAdmin.from("customers").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

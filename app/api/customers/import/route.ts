import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { parseKitCount, toE164 } from "@/lib/format";
import type { Customer } from "@/types/database";

const MAX_ROWS = 500;

type CustomerInsertRow = Pick<Customer, "name" | "phone" | "agent_id"> &
  Partial<Customer>;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  // Customers belong to the agent who works them; admins are read-only.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const rows: unknown[] = Array.isArray(body?.rows) ? body.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Import is limited to ${MAX_ROWS} rows at a time — split the file and retry.` },
      { status: 400 }
    );
  }

  const ownerId = auth.session.agent.id;
  const toInsert: CustomerInsertRow[] = [];
  const skipped: { row: number; reason: string }[] = [];

  rows.forEach((raw, index) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const name = stringOrNull(r.name);
    const phoneRaw = stringOrNull(r.phone);

    if (!name || !phoneRaw) {
      skipped.push({ row: index + 1, reason: "missing name or phone" });
      return;
    }

    const normalizedPhone = toE164(phoneRaw);
    if (!normalizedPhone) {
      skipped.push({ row: index + 1, reason: `"${phoneRaw}" isn't a callable number` });
      return;
    }

    const kitCount = parseKitCount(r.kit_count);
    if (kitCount === "invalid") {
      skipped.push({ row: index + 1, reason: "kit_count must be a whole number between 1 and 10" });
      return;
    }

    const timezone = parseCanadaTimezoneInput(r.timezone);
    if (timezone === "invalid") {
      skipped.push({ row: index + 1, reason: "time zone must be Atlantic, Eastern, Mountain, or Pacific" });
      return;
    }

    toInsert.push({
      name,
      phone: normalizedPhone,
      email: stringOrNull(r.email),
      company: stringOrNull(r.company),
      notes: stringOrNull(r.notes),
      province: stringOrNull(r.province),
      timezone,
      kit_count: kitCount,
      mailing_address: stringOrNull(r.mailing_address),
      request_date: stringOrNull(r.request_date),
      agent_id: ownerId,
    });
  });

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped });
  }

  const { data, error } = await supabaseAdmin.from("customers").insert(toInsert).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0, skipped }, { status: 201 });
}

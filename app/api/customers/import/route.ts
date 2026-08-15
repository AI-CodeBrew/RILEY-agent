import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { parseKitCount, toE164 } from "@/lib/format";
import { CALL_TYPES, type CallType, type Customer } from "@/types/database";

const MAX_ROWS = 500;

type CustomerInsertRow = Pick<Customer, "name" | "phone" | "agent_id"> &
  Partial<Customer>;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Build an insert row — omit extended columns when empty so imports still work before every migration is applied remotely. */
function buildInsertRow(
  r: Record<string, unknown>,
  ownerId: string
): CustomerInsertRow | { error: string } {
  const name = stringOrNull(r.name);
  const phoneRaw = stringOrNull(r.phone);

  if (!name || !phoneRaw) {
    return { error: "missing name or phone" };
  }

  const normalizedPhone = toE164(phoneRaw);
  if (!normalizedPhone) {
    return { error: `"${phoneRaw}" isn't a callable number` };
  }

  const kitCount = parseKitCount(r.kit_count);
  if (kitCount === "invalid") {
    return { error: "kit_count must be a whole number between 1 and 10" };
  }

  const timezone = parseCanadaTimezoneInput(r.timezone);
  if (timezone === "invalid") {
    return { error: "time zone must be Atlantic, Eastern, Mountain, or Pacific" };
  }

  const row: CustomerInsertRow = {
    name,
    phone: normalizedPhone,
    agent_id: ownerId,
    email: stringOrNull(r.email),
    company: stringOrNull(r.company),
    notes: stringOrNull(r.notes),
    province: stringOrNull(r.province),
    timezone,
    kit_count: kitCount,
    mailing_address: stringOrNull(r.mailing_address),
    request_date: stringOrNull(r.request_date),
  };

  const dateOfBirth = stringOrNull(r.date_of_birth);
  if (dateOfBirth) row.date_of_birth = dateOfBirth;

  const beneficiaryName = stringOrNull(r.beneficiary_name);
  if (beneficiaryName) row.beneficiary_name = beneficiaryName;

  // New intake columns (00000000000022_customer_intake_fields.sql) — same
  // "only set when present" pattern as date_of_birth/beneficiary_name above,
  // so imports still work against a database that hasn't run that migration yet.
  const firstName = stringOrNull(r.first_name);
  if (firstName) row.first_name = firstName;

  const middleName = stringOrNull(r.middle_name);
  if (middleName) row.middle_name = middleName;

  const lastName = stringOrNull(r.last_name);
  if (lastName) row.last_name = lastName;

  const homeTelephone = stringOrNull(r.home_telephone);
  if (homeTelephone) row.home_telephone = homeTelephone;

  const cellularPhone = stringOrNull(r.cellular_phone);
  if (cellularPhone) row.cellular_phone = cellularPhone;

  const city = stringOrNull(r.city);
  if (city) row.city = city;

  const postalCode = stringOrNull(r.postal_code);
  if (postalCode) row.postal_code = postalCode;

  const relationship = stringOrNull(r.relationship);
  if (relationship) row.relationship = relationship;

  const shift = stringOrNull(r.shift);
  if (shift) row.shift = shift;

  const preferredMeetingTime = stringOrNull(r.preferred_meeting_time);
  if (preferredMeetingTime) row.preferred_meeting_time = preferredMeetingTime;

  const callType = stringOrNull(r.call_type);
  if (callType) {
    if (!CALL_TYPES.includes(callType as CallType)) {
      return { error: `call_type must be one of ${CALL_TYPES.join(", ")}` };
    }
    row.call_type = callType as CallType;
  }

  return row;
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
    const built = buildInsertRow(r, ownerId);

    if ("error" in built) {
      skipped.push({ row: index + 1, reason: built.error });
      return;
    }

    toInsert.push(built);
  });

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped });
  }

  const { data, error } = await supabaseAdmin.from("customers").insert(toInsert).select("id");

  if (error) {
    const missingColumnHints: [string, string][] = [
      ["beneficiary_name", "00000000000013_customer_dob_beneficiary.sql"],
      ["date_of_birth", "00000000000013_customer_dob_beneficiary.sql"],
      ["first_name", "00000000000022_customer_intake_fields.sql"],
      ["middle_name", "00000000000022_customer_intake_fields.sql"],
      ["last_name", "00000000000022_customer_intake_fields.sql"],
      ["home_telephone", "00000000000022_customer_intake_fields.sql"],
      ["cellular_phone", "00000000000022_customer_intake_fields.sql"],
      ["city", "00000000000022_customer_intake_fields.sql"],
      ["postal_code", "00000000000022_customer_intake_fields.sql"],
      ["relationship", "00000000000022_customer_intake_fields.sql"],
      ["shift", "00000000000022_customer_intake_fields.sql"],
    ];
    const hit = missingColumnHints.find(([column]) => error.message.includes(column));
    const message = hit
      ? `${error.message} Run pending Supabase migrations (${hit[1]}) on your database.`
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0, skipped }, { status: 201 });
}

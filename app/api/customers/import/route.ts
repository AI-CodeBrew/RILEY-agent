import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { parseKitCount, toE164 } from "@/lib/format";
import { CALL_TYPES, type Customer } from "@/types/database";
import { parseCallType } from "@/lib/call-type";

const MAX_ROWS = 1000;
/**
 * Rows per database round-trip. The existing-phone lookup puts every phone
 * in the request URL, which PostgREST caps well below a full import's worth
 * — and a lookup that fails that way would silently let duplicates through.
 */
const CHUNK_SIZE = 500;

function chunked<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) chunks.push(items.slice(i, i + CHUNK_SIZE));
  return chunks;
}

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

  const provinceValue = stringOrNull(r.province);
  const timezone = parseCanadaTimezoneInput(r.timezone, provinceValue);
  if (timezone === "invalid") {
    return { error: "time zone must be Atlantic, Eastern, Mountain, or Pacific" };
  }

  const row: CustomerInsertRow = {
    name,
    phone: normalizedPhone,
    agent_id: ownerId,
    source: "csv",
    email: stringOrNull(r.email),
    company: stringOrNull(r.company),
    notes: stringOrNull(r.notes),
    province: provinceValue,
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

  const callTypeRaw = stringOrNull(r.call_type);
  if (!callTypeRaw) return { error: "missing call_type" };
  const callType = parseCallType(callTypeRaw);
  if (!callType) {
    return { error: `call_type must be one of ${CALL_TYPES.join(", ")}` };
  }
  row.call_type = callType;

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
  const candidates: { index: number; row: CustomerInsertRow }[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seenPhones = new Set<string>();

  // Repeated phone numbers within the same file are kept once (first
  // occurrence wins) instead of being inserted multiple times.
  rows.forEach((raw, index) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const built = buildInsertRow(r, ownerId);

    if ("error" in built) {
      skipped.push({ row: index + 1, reason: built.error });
      return;
    }

    if (seenPhones.has(built.phone)) {
      skipped.push({
        row: index + 1,
        reason: `duplicate phone ${built.phone} — already included earlier in this file`,
      });
      return;
    }
    seenPhones.add(built.phone);
    candidates.push({ index, row: built });
  });

  if (candidates.length === 0) {
    return NextResponse.json({ inserted: 0, skipped });
  }

  // Phone numbers that already belong to an existing customer are skipped
  // too, so re-importing the same list (or a list that overlaps an earlier
  // one) doesn't create duplicate customers.
  const existingPhones = new Set<string>();
  for (const phones of chunked(Array.from(seenPhones))) {
    const { data: existingRows, error: lookupError } = await applyAgentScope(
      supabaseAdmin.from("customers").select("phone").in("phone", phones),
      auth.session
    );
    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    for (const c of existingRows ?? []) existingPhones.add(c.phone);
  }

  const toInsert: CustomerInsertRow[] = [];
  candidates.forEach(({ index, row }) => {
    if (existingPhones.has(row.phone)) {
      skipped.push({
        row: index + 1,
        reason: `a customer with phone ${row.phone} already exists`,
      });
      return;
    }
    toInsert.push(row);
  });

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped });
  }

  let inserted = 0;
  let error: { message: string } | null = null;
  for (const batch of chunked(toInsert)) {
    const result = await supabaseAdmin.from("customers").insert(batch).select("id");
    if (result.error) {
      error = result.error;
      break;
    }
    inserted += result.data?.length ?? 0;
  }

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
    // Batches before the failing one are already saved; re-importing the
    // same file skips them as existing customers and picks up the rest.
    const partial = inserted > 0 ? ` ${inserted} rows were imported before this — re-import the same file to add the rest.` : "";
    return NextResponse.json({ error: message + partial }, { status: 500 });
  }

  return NextResponse.json({ inserted, skipped }, { status: 201 });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { redactCustomersForSession } from "@/lib/customer-visibility";
import type { CustomerStatus, CustomerWithAgent } from "@/types/database";

/** Same escaping convention as app/api/campaigns/[id]/export/route.ts. */
function csvEscape(value: string | null | undefined) {
  const text = value ?? "";
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

const HEADER = [
  "first_name",
  "last_name",
  "name",
  "phone",
  "email",
  "mailing_address",
  "city",
  "province",
  "postal_code",
  "status",
  "agent",
  "company",
  "call_type",
  "last_contacted_at",
  "next_contact_at",
  "follow_up_at",
  "notes",
  "created_at",
];

/**
 * Exports customers as CSV, scoped to whatever filters (status/agent/search)
 * are currently applied on the customers page — same query-building and
 * agent-scoping/redaction as app/(portal)/customers/page.tsx, just streamed
 * as a file instead of rendered as a table. No pagination on either side, so
 * a category with hundreds of customers still exports in full.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const agentFilter = searchParams.get("agent");
  const q = searchParams.get("q");

  let query = applyAgentScope(
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name, email)")
      .order("created_at", { ascending: false }),
    session,
    { requestedAgentId: agentFilter ?? undefined }
  );

  if (status) query = query.eq("status", status as CustomerStatus);
  if (q) {
    const term = `%${q.replaceAll("%", "")}%`;
    query = query.or(
      `name.ilike.${term},phone.ilike.${term},email.ilike.${term},company.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customers = redactCustomersForSession(
    (data ?? []) as CustomerWithAgent[],
    session
  );

  const rows = customers.map((c) =>
    [
      csvEscape(c.first_name),
      csvEscape(c.last_name),
      csvEscape(c.name),
      csvEscape(c.phone),
      csvEscape(c.email),
      csvEscape(c.mailing_address),
      csvEscape(c.city),
      csvEscape(c.province),
      csvEscape(c.postal_code),
      csvEscape(c.status),
      csvEscape(c.agent?.name ?? ""),
      csvEscape(c.company),
      csvEscape(c.call_type),
      csvEscape(c.last_contacted_at),
      csvEscape(c.next_contact_at),
      csvEscape(c.follow_up_at),
      csvEscape(c.notes),
      csvEscape(c.created_at),
    ].join(",")
  );

  const csv = [HEADER.join(","), ...rows].join("\n");
  const filename = `customers-${status ? status.replaceAll("_", "-") : "all"}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

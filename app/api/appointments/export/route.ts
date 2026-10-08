import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseDateRangeFilter } from "@/lib/date-range";
import {
  canadaTimezoneLabel,
  isCanadaTimezone,
  resolveCustomerTimezone,
} from "@/lib/canada-timezones";
import type { AppointmentStatus, AppointmentWithRelations } from "@/types/database";

/** Same escaping convention as app/api/campaigns/[id]/export/route.ts. */
function csvEscape(value: string | null | undefined) {
  const text = value ?? "";
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * "2026-10-08 2:30 PM" in the given zone — an ISO-like date (the sv-SE
 * layout) a spreadsheet parses and sorts as a real date, unlike the
 * "Oct 8, 2026, 2:30 PM" the table renders, with a 12-hour AM/PM time.
 */
function formatLocal(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
  return `${day} ${time}`;
}

const HEADER = [
  "customer",
  "phone",
  "email",
  "agent",
  "booked_by",
  "status",
  "meeting_at",
  "created_at",
  "canceled_at",
  "time_zone",
  "customer_time_zone",
  "meeting_at_utc",
  "created_at_utc",
  "duration_minutes",
  "meeting_link",
  "notes",
  "canceled_reason",
];

/**
 * Exports appointments as CSV, scoped to whatever filters (when/status/agent/
 * search/date range) are currently applied on the appointments page — same
 * query-building and agent-scoping as app/(portal)/appointments/page.tsx,
 * just streamed as a file instead of rendered as a table. Times are written
 * in the viewer's own timezone (named in the time_zone column, by the same
 * Atlantic/Eastern/Mountain/Pacific label the rest of the portal uses),
 * matching what the page shows, with the UTC instants alongside.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const when = searchParams.get("when");
  const status = searchParams.get("status");
  const agentFilter = searchParams.get("agent");
  const q = searchParams.get("q");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const timeZone = session.agent.timezone;
  // A legacy non-Canadian zone keeps its IANA name rather than being labelled
  // as the nearest supported zone, since the times are written in it as-is.
  const timeZoneLabel = isCanadaTimezone(timeZone) ? canadaTimezoneLabel(timeZone) : timeZone;

  let query = applyAgentScope(
    supabaseAdmin
      .from("appointments")
      .select(
        "*, customer:customers(id, name, phone, email, timezone, province), agent:sales_agents(id, name, email)"
      ),
    session,
    { requestedAgentId: agentFilter ?? undefined }
  );

  const dateRange = parseDateRangeFilter(from, to, timeZone);
  if (dateRange.startUtc || dateRange.endUtc) {
    if (dateRange.startUtc) query = query.gte("scheduled_at", dateRange.startUtc);
    if (dateRange.endUtc) query = query.lt("scheduled_at", dateRange.endUtc);
    query = query.order("scheduled_at", { ascending: true });
  } else {
    const nowIso = new Date().toISOString();
    if (when === "past") {
      query = query.lt("scheduled_at", nowIso).order("scheduled_at", { ascending: false });
    } else if (when === "all") {
      query = query.order("scheduled_at", { ascending: false });
    } else {
      query = query.gte("scheduled_at", nowIso).order("scheduled_at", { ascending: true });
    }
  }

  if (status) query = query.eq("status", status as AppointmentStatus);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let appointments = (data ?? []) as (AppointmentWithRelations & {
    customer: { timezone: string | null; province: string | null } | null;
  })[];
  if (q) {
    const term = q.toLowerCase();
    appointments = appointments.filter(
      (appointment) =>
        appointment.customer?.name.toLowerCase().includes(term) ||
        appointment.customer?.phone.includes(term) ||
        appointment.customer?.email?.toLowerCase().includes(term)
    );
  }

  const rows = appointments.map((a) =>
    [
      csvEscape(a.customer?.name),
      csvEscape(a.customer?.phone),
      csvEscape(a.customer?.email),
      csvEscape(a.agent?.name),
      csvEscape(a.source),
      csvEscape(a.status),
      csvEscape(formatLocal(a.scheduled_at, timeZone)),
      csvEscape(formatLocal(a.created_at, timeZone)),
      csvEscape(formatLocal(a.canceled_at, timeZone)),
      csvEscape(timeZoneLabel),
      csvEscape(
        a.customer
          ? canadaTimezoneLabel(resolveCustomerTimezone(a.customer.timezone, a.customer.province))
          : ""
      ),
      csvEscape(a.scheduled_at),
      csvEscape(a.created_at),
      csvEscape(String(a.duration_minutes)),
      csvEscape(a.zoom_link),
      csvEscape(a.notes),
      csvEscape(a.canceled_reason),
    ].join(",")
  );

  const csv = [HEADER.join(","), ...rows].join("\n");
  const filename = `appointments-${from || to ? `${from ?? "start"}-to-${to ?? "end"}` : (when ?? "upcoming")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseDateRangeFilter } from "@/lib/date-range";
import { canadaTimezoneLabel, isCanadaTimezone } from "@/lib/canada-timezones";
import {
  LIVE_CALL_STATUSES,
  type CallOutcome,
  type CallWithRelations,
} from "@/types/database";

// PostgREST caps a single response at 1000 rows (Supabase `max_rows`), so the
// export is fetched in chunks of this size.
const EXPORT_CHUNK = 1000;

/** Same escaping convention as app/api/campaigns/[id]/export/route.ts. */
function csvEscape(value: string | null | undefined) {
  const text = value ?? "";
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Same "2026-10-08 2:30 PM" layout as app/api/appointments/export/route.ts. */
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

/**
 * Exports calls as CSV, scoped to whatever filters (outcome/agent/date range)
 * are currently applied on the calls page — same query-building and
 * agent-scoping as app/(portal)/calls/page.tsx, but every matching call rather
 * than one table page. Times are written in the viewer's own timezone, with
 * the UTC instant alongside. Cost is an admin-only column, as on the page.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const outcome = searchParams.get("outcome");
  const agentFilter = searchParams.get("agent");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const timeZone = session.agent.timezone;
  const timeZoneLabel = isCanadaTimezone(timeZone) ? canadaTimezoneLabel(timeZone) : timeZone;
  const dateRange = parseDateRangeFilter(from, to, timeZone);

  function chunk(offset: number) {
    let query = applyAgentScope(
      supabaseAdmin
        .from("calls")
        // `calls` points at sales_agents twice (agent_id, triggered_by), so the
        // embed has to name the constraint or PostgREST refuses as ambiguous.
        .select(
          "id, created_at, scheduled_for, status, outcome, duration_seconds, cost, ended_reason, summary, customer:customers(id, name, phone), agent:sales_agents!calls_agent_id_fkey(id, name)"
        ),
      session,
      { requestedAgentId: agentFilter ?? undefined }
    );
    if (outcome === "live") {
      query = query.in("status", [...LIVE_CALL_STATUSES]);
    } else if (outcome) {
      query = query.eq("outcome", outcome as NonNullable<CallOutcome>);
    }
    if (dateRange.startUtc) query = query.gte("created_at", dateRange.startUtc);
    if (dateRange.endUtc) query = query.lt("created_at", dateRange.endUtc);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + EXPORT_CHUNK - 1);
  }

  const calls: CallWithRelations[] = [];
  for (let offset = 0; ; offset += EXPORT_CHUNK) {
    const { data, error } = await chunk(offset);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    calls.push(...((data ?? []) as unknown as CallWithRelations[]));
    if (!data || data.length < EXPORT_CHUNK) break;
  }

  const header = [
    "called_at",
    "customer",
    "phone",
    "agent",
    "state",
    "outcome",
    "duration_seconds",
    "ended_reason",
    "summary",
    "time_zone",
    "called_at_utc",
    ...(session.isAdmin ? ["cost"] : []),
  ];

  const rows = calls.map((call) => {
    const calledAt = call.scheduled_for ?? call.created_at;
    return [
      csvEscape(formatLocal(calledAt, timeZone)),
      csvEscape(call.customer?.name),
      csvEscape(call.customer?.phone),
      csvEscape(call.agent?.name),
      csvEscape(call.status),
      csvEscape(call.outcome),
      csvEscape(call.duration_seconds == null ? "" : String(call.duration_seconds)),
      csvEscape(call.ended_reason),
      csvEscape(call.summary),
      csvEscape(timeZoneLabel),
      csvEscape(calledAt),
      ...(session.isAdmin ? [csvEscape(call.cost == null ? "" : String(call.cost))] : []),
    ].join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  const filename = `calls-${from || to ? `${from ?? "start"}-to-${to ?? "end"}` : (outcome ? outcome.replaceAll("_", "-") : "all")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

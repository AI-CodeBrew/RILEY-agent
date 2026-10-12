import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { parseDateRangeFilter } from "@/lib/date-range";
import { CALL_OUTCOMES } from "@/types/database";

// PostgREST caps a single response at 1000 rows (Supabase `max_rows`), so the
// report's calls are fetched in chunks of this size.
const REPORT_CHUNK = 1000;

/**
 * Exports a day-by-day count of calls per outcome as CSV — one row per date
 * (in the viewer's own timezone) plus a Total row — scoped to the agent and
 * date-range filters applied on the calls page. The outcome filter is
 * deliberately ignored: the report's whole point is the split across outcomes.
 * `no_outcome` covers calls without one yet (still in flight, or never resolved).
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const agentFilter = searchParams.get("agent");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const timeZone = session.agent.timezone;
  const dateRange = parseDateRangeFilter(from, to, timeZone);

  function chunk(offset: number) {
    let query = applyAgentScope(
      supabaseAdmin.from("calls").select("created_at, outcome"),
      session,
      { requestedAgentId: agentFilter ?? undefined }
    );
    if (dateRange.startUtc) query = query.gte("created_at", dateRange.startUtc);
    if (dateRange.endUtc) query = query.lt("created_at", dateRange.endUtc);
    return query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + REPORT_CHUNK - 1);
  }

  const columns = [...CALL_OUTCOMES, "no_outcome"] as const;
  type Column = (typeof columns)[number];
  const emptyCounts = () =>
    Object.fromEntries(columns.map((column) => [column, 0])) as Record<Column, number>;

  // "2026-10-08" in the viewer's zone (the sv-SE layout), so a spreadsheet
  // sorts it as a real date. Rows arrive oldest first, so the Map's insertion
  // order is already chronological.
  const dayFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone });
  const byDay = new Map<string, Record<Column, number>>();
  const totals = emptyCounts();

  for (let offset = 0; ; offset += REPORT_CHUNK) {
    const { data, error } = await chunk(offset);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const call of data ?? []) {
      const day = dayFormat.format(new Date(call.created_at));
      let counts = byDay.get(day);
      if (!counts) {
        counts = emptyCounts();
        byDay.set(day, counts);
      }
      const column: Column = call.outcome ?? "no_outcome";
      counts[column] += 1;
      totals[column] += 1;
    }
    if (!data || data.length < REPORT_CHUNK) break;
  }

  const line = (label: string, counts: Record<Column, number>) =>
    [
      label,
      columns.reduce((sum, column) => sum + counts[column], 0),
      ...columns.map((column) => counts[column]),
    ].join(",");

  const csv = [
    ["date", "total_calls", ...columns].join(","),
    ...[...byDay].map(([day, counts]) => line(day, counts)),
    line("Total", totals),
  ].join("\n");
  const filename = `calls-daily-report-${from || to ? `${from ?? "start"}-to-${to ?? "end"}` : "all"}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

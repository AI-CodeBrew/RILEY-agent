import Link from "next/link";
import { Phone, PhoneCall, PhoneOff, Timer } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { formatCost, formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DateRangeFilter, FilterPills } from "@/components/Filters";
import { AutoRefresh } from "@/components/AutoRefresh";
import { parseDateRangeFilter } from "@/lib/date-range";
import { CallsTable } from "./CallsTable";
import {
  LIVE_CALL_STATUSES,
  type CallOutcome,
  type CallWithRelations,
} from "@/types/database";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: null, label: "All" },
  { value: "live", label: "In flight" },
  { value: "appointment_set", label: "Booked" },
  { value: "no_answer", label: "No answer" },
  { value: "voicemail", label: "Voicemail" },
  { value: "not_interested", label: "Not interested" },
  { value: "call_back_later", label: "Call back" },
];

// Rows shown per table page. Stats are computed over every matching call,
// not just this page.
const PAGE_SIZE = 50;
// PostgREST caps a single response at 1000 rows (Supabase `max_rows`), so the
// stats query is fetched in chunks of this size.
const STATS_CHUNK = 1000;

type CallsSearchParams = {
  outcome?: string;
  agent?: string;
  from?: string;
  to?: string;
  page?: string;
};

interface Filterable<T> {
  eq(column: string, value: string): T;
  in(column: string, values: readonly string[]): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<CallsSearchParams>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const { outcome, agent: agentFilter, from, to } = params;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const dateRange = parseDateRangeFilter(from, to, session.agent.timezone);

  // Same scope + filters for the table page and the stats, so the numbers
  // always describe exactly the calls the filter matches.
  function applyFilters<T extends Filterable<T>>(query: T): T {
    let q = applyAgentScope(query, session, { requestedAgentId: agentFilter });
    if (outcome === "live") {
      q = q.in("status", [...LIVE_CALL_STATUSES]);
    } else if (outcome) {
      q = q.eq("outcome", outcome as NonNullable<CallOutcome>);
    }
    if (dateRange.startUtc) q = q.gte("created_at", dateRange.startUtc);
    if (dateRange.endUtc) q = q.lt("created_at", dateRange.endUtc);
    return q;
  }

  function statsChunk(offset: number) {
    return applyFilters(
      supabaseAdmin
        .from("calls")
        .select("status, duration_seconds, cost", { count: "exact" })
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + STATS_CHUNK - 1);
  }

  // The first stats chunk (which also returns the exact total) and the
  // admin-only agents query don't depend on each other, so run them together.
  const agentsQuery = session.isAdmin
    ? supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : Promise.resolve({ data: null as { id: string; name: string }[] | null });

  const [firstStats, { data: agents }] = await Promise.all([statsChunk(0), agentsQuery]);
  const totalCalls = firstStats.count ?? firstStats.data?.length ?? 0;

  const remainingOffsets: number[] = [];
  for (let offset = STATS_CHUNK; offset < totalCalls; offset += STATS_CHUNK) {
    remainingOffsets.push(offset);
  }

  const totalPages = Math.max(1, Math.ceil(totalCalls / PAGE_SIZE));
  // Clamp so changing a filter while on a later page doesn't land on an
  // empty page.
  const page = Math.min(requestedPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;

  const pageQuery = applyFilters(
    supabaseAdmin
      .from("calls")
      // `calls` points at sales_agents twice (agent_id, triggered_by), so the
      // embed has to name the constraint or PostgREST refuses as ambiguous.
      // Narrowed to what this table actually renders — the transcript is
      // fetched on demand by TranscriptButton (GET /api/calls/[id]/transcript)
      // rather than needing to ride along with every row here.
      .select(
        "id, created_at, scheduled_for, status, outcome, duration_seconds, cost, vapi_call_id, customer:customers(id, name, phone), agent:sales_agents!calls_agent_id_fkey(id, name)"
      )
  )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(pageStart, pageStart + PAGE_SIZE - 1);

  const [{ data, error: pageError }, ...moreStats] = await Promise.all([
    pageQuery,
    ...remainingOffsets.map(statsChunk),
  ]);
  const calls = (data ?? []) as CallWithRelations[];

  const statsRows = [firstStats, ...moreStats].flatMap((chunk) => chunk.data ?? []);
  const error =
    pageError ?? firstStats.error ?? moreStats.find((chunk) => chunk.error)?.error ?? null;

  const liveCount = statsRows.filter((call) =>
    LIVE_CALL_STATUSES.some((status) => status === call.status)
  ).length;
  const finished = statsRows.filter((call) => call.status === "ended");
  const totalSeconds = finished.reduce(
    (sum, call) => sum + (call.duration_seconds ?? 0),
    0
  );
  const totalCost = finished.reduce((sum, call) => sum + (call.cost ?? 0), 0);

  function pageHref(target: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `/calls?${qs}` : "/calls";
  }

  return (
    <div className="space-y-6">
      <AutoRefresh active={liveCount > 0} />

      <PageHeader
        title="Calls"
        description="Every outbound call Riley placed for you — with transcripts, recordings and a hang-up button for anything still live."
      />

      <div
        className={
          session.isAdmin
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-4 sm:grid-cols-3"
        }
      >
        <StatCard
          label="Total calls"
          value={totalCalls.toLocaleString()}
          icon={Phone}
          hint={`${finished.length.toLocaleString()} completed`}
        />
        <StatCard
          label="In flight"
          value={liveCount}
          icon={PhoneCall}
          tone={liveCount > 0 ? "danger" : "default"}
          hint={liveCount > 0 ? "cancel from the row" : "nothing dialling"}
        />
        <StatCard
          label="Talk time"
          value={formatDuration(totalSeconds)}
          icon={Timer}
          hint={`${finished.length.toLocaleString()} completed calls`}
        />
        {session.isAdmin && (
          <StatCard
            label="Spend"
            value={formatCost(totalCost)}
            icon={PhoneOff}
            hint="Vapi + telephony, as reported"
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <DateRangeFilter />
        <FilterPills paramKey="outcome" options={FILTERS} />
        {session.isAdmin && agents && agents.length > 0 && (
          <FilterPills
            paramKey="agent"
            options={[
              { value: null, label: "All agents" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">Failed to load calls: {error.message}</p>
      )}

      <CallsTable
        calls={calls}
        isAdmin={session.isAdmin}
        timezone={session.agent.timezone}
        emptyTitle={outcome || from || to ? "No calls match that filter" : "No calls yet"}
      />

      {totalCalls > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>
            Showing {(pageStart + 1).toLocaleString()}–
            {Math.min(pageStart + PAGE_SIZE, totalCalls).toLocaleString()} of{" "}
            {totalCalls.toLocaleString()} calls
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                Previous
              </PageLink>
              <span>
                Page {page} of {totalPages}
              </span>
              <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                Next
              </PageLink>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "rounded-lg border border-border px-3 py-1.5 text-xs font-medium";
  if (disabled) {
    return (
      <span className={`${className} cursor-not-allowed opacity-40`} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={`${className} hover:text-foreground`}>
      {children}
    </Link>
  );
}

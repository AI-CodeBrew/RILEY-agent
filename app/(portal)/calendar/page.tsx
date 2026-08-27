import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { MeetingsView } from "./MeetingsView";
import { addDays, dayStartUtc, startOfWeek, zonedDateString } from "./calendar-dates";
import type { AppointmentWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

export type MeetingsRange = "day" | "upcoming" | "week" | "lastweek";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UPCOMING_LIMIT = 200;

function weekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}`;
}

function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; date?: string; agent?: string }>;
}) {
  const session = await requireSession();
  const { range: rangeParam, date: dateParam, agent: agentFilter } = await searchParams;

  const range: MeetingsRange =
    rangeParam === "day" || rangeParam === "week" || rangeParam === "lastweek"
      ? rangeParam
      : "upcoming";
  const timezone = session.agent.timezone;

  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  const today = zonedDateString(new Date(), timezone);
  const anchor = dateParam && DATE_RE.test(dateParam) ? dateParam : today;

  // Explicit columns instead of "*" — this set covers both the list rows
  // (scheduled_at, duration_minutes, status, customer/agent name) and
  // AppointmentDetailModal, which renders whichever row gets clicked from
  // this same in-memory object rather than fetching it separately.
  let query = applyAgentScope(
    supabaseAdmin
      .from("appointments")
      .select(
        "id, scheduled_at, duration_minutes, status, source, zoom_link, calendly_event_uri, booking_url, reschedule_url, notes, customer:customers(id, name, phone), agent:sales_agents(id, name)"
      ),
    session,
    { requestedAgentId: agentFilter }
  );

  let rangeLabel = "Upcoming";

  if (range === "upcoming") {
    query = query
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(UPCOMING_LIMIT);
  } else {
    let rangeStart: string;
    let rangeEnd: string;
    if (range === "day") {
      rangeStart = anchor;
      rangeEnd = addDays(anchor, 1);
      rangeLabel = dayLabel(rangeStart);
    } else if (range === "week") {
      rangeStart = startOfWeek(anchor);
      rangeEnd = addDays(rangeStart, 7);
      rangeLabel = weekLabel(rangeStart);
    } else {
      const thisWeekStart = startOfWeek(today);
      rangeStart = addDays(thisWeekStart, -7);
      rangeEnd = thisWeekStart;
      rangeLabel = weekLabel(rangeStart);
    }
    query = query
      .gte("scheduled_at", dayStartUtc(rangeStart, timezone).toISOString())
      .lt("scheduled_at", dayStartUtc(rangeEnd, timezone).toISOString())
      .order("scheduled_at", { ascending: true });
  }

  // The appointments query and the admin-only agents query don't depend on
  // each other, so they're run concurrently instead of one after the other.
  const agentsQuery = session.isAdmin
    ? supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : Promise.resolve({ data: null as { id: string; name: string }[] | null });

  const [{ data, error }, { data: agentRows }] = await Promise.all([query, agentsQuery]);
  const appointments = (data ?? []) as AppointmentWithRelations[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description={
          session.isAdmin
            ? "Every meeting booked across the team, grouped by day."
            : "Every meeting Riley booked, plus anything you added by hand — grouped by day."
        }
      />

      {error && (
        <p className="text-sm text-red-600">
          Failed to load appointments: {error.message}
        </p>
      )}

      <MeetingsView
        range={range}
        anchor={anchor}
        today={today}
        rangeLabel={rangeLabel}
        timezone={timezone}
        isAdmin={session.isAdmin}
        appointments={appointments}
        agents={agentRows ?? []}
      />
    </div>
  );
}

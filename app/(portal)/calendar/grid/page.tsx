import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { CalendarShell } from "../CalendarShell";
import {
  addDays,
  dayStartUtc,
  startOfMonthGrid,
  startOfWeek,
  zonedDateString,
  type CalendarView,
} from "../calendar-dates";
import type { AppointmentWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarGridPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; agent?: string }>;
}) {
  const session = await requireSession();
  const { view: viewParam, date: dateParam, agent: agentFilter } = await searchParams;

  const view: CalendarView =
    viewParam === "week" || viewParam === "day" ? viewParam : "month";
  const timezone = session.agent.timezone;

  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  const today = zonedDateString(new Date(), timezone);
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today;

  const rangeStart =
    view === "month" ? startOfMonthGrid(date) : view === "week" ? startOfWeek(date) : date;
  const rangeDays = view === "month" ? 42 : view === "week" ? 7 : 1;
  const rangeEnd = addDays(rangeStart, rangeDays);

  // Explicit columns instead of "*" — covers both the grid chips
  // (scheduled_at, duration_minutes, status, customer name) and
  // AppointmentDetailModal, which renders whichever row gets clicked from
  // this same in-memory object rather than fetching it separately.
  const query = applyAgentScope(
    supabaseAdmin
      .from("appointments")
      .select(
        "id, scheduled_at, duration_minutes, status, source, zoom_link, calendly_event_uri, booking_url, reschedule_url, notes, customer:customers(id, name, phone), agent:sales_agents(id, name)"
      )
      .gte("scheduled_at", dayStartUtc(rangeStart, timezone).toISOString())
      .lt("scheduled_at", dayStartUtc(rangeEnd, timezone).toISOString())
      .order("scheduled_at", { ascending: true }),
    session,
    { requestedAgentId: agentFilter }
  );

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
        title="Grid view"
        description={
          session.isAdmin
            ? "Every appointment booked across the team, laid out the way an agent sees their own day."
            : "Every appointment Riley booked, plus anything you added by hand — Day, Week, and Month views of the same list you see on Meetings."
        }
      />

      {error && (
        <p className="text-sm text-red-600">
          Failed to load appointments: {error.message}
        </p>
      )}

      <CalendarShell
        view={view}
        date={date}
        today={today}
        timezone={timezone}
        agentId={session.agent.id}
        isAdmin={session.isAdmin}
        appointments={appointments}
        agents={agentRows ?? []}
      />
    </div>
  );
}

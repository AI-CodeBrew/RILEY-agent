import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  PhoneCall,
  PhoneOutgoing,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { StatusBadge } from "@/lib/status-badge";
import { dailyCounts, formatDateTime, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { LinkButton } from "@/components/Button";
import { RankedBars, TrendBars } from "@/components/Charts";
import { FilterPills } from "@/components/Filters";
import { LiveCallsBanner } from "./LiveCallsBanner";
import {
  LIVE_CALL_STATUSES,
  type AppointmentWithRelations,
  type CallWithRelations,
} from "@/types/database";

export const dynamic = "force-dynamic";

const DASHBOARD_LIST_LIMIT = 4;

const OUTCOME_LABELS: Record<string, string> = {
  appointment_set: "Appointment set",
  call_back_later: "Call back later",
  no_answer: "No answer",
  voicemail: "Voicemail",
  not_interested: "Not interested",
  error: "Error",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const session = await requireSession();
  const { agent: agentFilter } = await searchParams;

  const scope = { requestedAgentId: agentFilter };

  const [
    { data: agents },
    { data: appointments },
    { data: calls },
    { data: customers },
  ] = await Promise.all([
    session.isAdmin
      ? supabaseAdmin.from("sales_agents").select("id, name").order("name")
      : Promise.resolve({ data: null }),
    applyAgentScope(
      supabaseAdmin
        .from("appointments")
        // Narrowed to what this page actually reads (stats + the "Next up"
        // preview list) — the full row (agent, email, phone, notes, etc.) is
        // only needed on the Appointments page itself, which fetches its own.
        .select("id, scheduled_at, status, created_at, customer:customers(name)")
        .order("scheduled_at", { ascending: false })
        .limit(500),
      session,
      scope
    ),
    applyAgentScope(
      supabaseAdmin
        .from("calls")
        // Narrowed to what this page actually reads (stats + the "Recent
        // calls" preview list) — no agent name is shown here, and the full
        // row (transcript, summary, call_insights, etc.) is only needed on
        // the Calls/Notes pages, which fetch their own.
        .select("id, customer_id, status, outcome, cost, created_at, customer:customers(name)")
        .order("created_at", { ascending: false })
        .limit(500),
      session,
      scope
    ),
    applyAgentScope(
      supabaseAdmin.from("customers").select("id, status"),
      session,
      scope
    ),
  ]);

  const appointmentRows = (appointments ?? []) as AppointmentWithRelations[];
  const callRows = (calls ?? []) as CallWithRelations[];
  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const upcoming = appointmentRows
    .filter(
      (appointment) =>
        new Date(appointment.scheduled_at).getTime() > now &&
        appointment.status !== "canceled"
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );

  const bookedLast7 = appointmentRows.filter(
    (appointment) =>
      new Date(appointment.created_at).getTime() > now - 7 * 86_400_000
  ).length;

  const liveCalls = callRows.filter((call) =>
    LIVE_CALL_STATUSES.some((status) => status === call.status)
  );

  const finishedCalls = callRows.filter((call) => call.status === "ended");
  const wonCalls = finishedCalls.filter(
    (call) => call.outcome === "appointment_set"
  ).length;
  const bookingRate = finishedCalls.length
    ? Math.round((wonCalls / finishedCalls.length) * 100)
    : 0;

  // Worth dialling: never contacted, or tried and due a follow-up.
  const toCall = (customers ?? []).filter(
    (customer) => customer.status === "new" || customer.status === "follow_up"
  ).length;

  const trend = dailyCounts(
    appointmentRows.map((appointment) => appointment.created_at),
    14,
    session.agent.timezone
  );

  const outcomes = Object.entries(OUTCOME_LABELS).map(([key, label]) => ({
    label,
    value: finishedCalls.filter((call) => call.outcome === key).length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${session.agent.name.split(" ")[0]}`}
        description={
          session.isAdmin
            ? "Everything booked across the whole team."
            : "Your pipeline, calls and booked appointments."
        }
        action={<TimezoneClocks />}
      />

      {session.isAdmin && agents && agents.length > 0 && (
        <FilterPills
          paramKey="agent"
          options={[
            { value: null, label: "All agents" },
            ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
          ]}
        />
      )}

      {liveCalls.length > 0 && <LiveCallsBanner calls={liveCalls} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Upcoming appointments"
          value={upcoming.length}
          icon={CalendarClock}
          hint={upcoming[0] ? `next ${formatRelative(upcoming[0].scheduled_at)}` : "nothing booked"}
        />
        <StatCard
          label="Booked this week"
          value={bookedLast7}
          icon={CalendarCheck}
          tone="success"
          hint="last 7 days"
        />
        <StatCard
          label="Booking rate"
          value={`${bookingRate}%`}
          icon={TrendingUp}
          hint={`${wonCalls} of ${finishedCalls.length} completed calls`}
        />
        <StatCard
          label="Customers to call"
          value={toCall}
          icon={Users}
          tone={toCall > 0 ? "warning" : "default"}
          hint={`${(customers ?? []).length} total`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Appointments booked</h2>
            <span className="text-xs text-muted">last 14 days</span>
          </div>
          <TrendBars data={trend} emptyLabel="No appointments booked in the last 14 days." />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Call outcomes</h2>
            <span className="text-xs text-muted">{finishedCalls.length} calls</span>
          </div>
          <RankedBars items={outcomes} emptyLabel="No completed calls yet." />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <section className="flex flex-col">
          <div className="mb-3 flex h-5 items-center">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-accent" />
              Next up
            </h2>
          </div>
          <Card className="flex flex-1 flex-col overflow-hidden">
            {upcoming.length > 0 ? (
              <>
                <ul className="flex-1 divide-y divide-border">
                  {upcoming.slice(0, DASHBOARD_LIST_LIMIT).map((appointment) => (
                    <li
                      key={appointment.id}
                      className="flex min-h-[4.25rem] items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {appointment.customer?.name ?? "Unknown customer"}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {formatDateTime(appointment.scheduled_at, session.agent.timezone)}
                          {" · "}
                          {formatRelative(appointment.scheduled_at)}
                        </p>
                      </div>
                      <StatusBadge status={appointment.status} />
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border px-4 py-3">
                  <LinkButton href="/appointments" variant="ghost" className="w-full">
                    View all
                  </LinkButton>
                </div>
              </>
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Nothing on the calendar"
                description={
                  session.isAdmin
                    ? "No upcoming appointments across the team."
                    : "Book one by calling a customer."
                }
                action={
                  !session.isAdmin ? (
                    <LinkButton href="/customers">
                      <PhoneOutgoing className="h-3.5 w-3.5" />
                      Go to customers
                    </LinkButton>
                  ) : undefined
                }
              />
            )}
          </Card>
        </section>

        <section className="flex flex-col">
          <div className="mb-3 flex h-5 items-center">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PhoneCall className="h-4 w-4 text-accent" />
              Recent calls
            </h2>
          </div>
          <Card className="flex flex-1 flex-col overflow-hidden">
            {callRows.length > 0 ? (
              <>
                <ul className="flex-1 divide-y divide-border">
                  {callRows.slice(0, DASHBOARD_LIST_LIMIT).map((call) => (
                    <li
                      key={call.id}
                      className="flex min-h-[4.25rem] items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${call.customer_id}`}
                          className="truncate text-sm font-medium hover:text-accent"
                        >
                          {call.customer?.name ?? "Unknown customer"}
                        </Link>
                        <p className="truncate text-xs text-muted">
                          {formatDateTime(call.created_at, session.agent.timezone)}
                          {" · "}
                          {formatRelative(call.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={call.outcome ?? call.status} />
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border px-4 py-3">
                  <LinkButton href="/calls" variant="ghost" className="w-full">
                    View all
                  </LinkButton>
                </div>
              </>
            ) : (
              <EmptyState
                icon={PhoneCall}
                title="No calls yet"
                description="Trigger your first outbound call from a customer."
              />
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

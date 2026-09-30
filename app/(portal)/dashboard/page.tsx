import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarCheck,
  CalendarClock,
  PhoneCall,
  PhoneOff,
  PhoneOutgoing,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { getBillingAccount } from "@/lib/billing";
import { StatusBadge } from "@/lib/status-badge";
import {
  dailyCounts,
  formatCost,
  formatDateTime,
  formatDuration,
  formatRelative,
} from "@/lib/format";
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
// Everything on the dashboard (except upcoming appointments and the customer
// pipeline, which are about now) covers this many trailing days.
const WINDOW_DAYS = 7;
// PostgREST caps a single response at 1000 rows (Supabase `max_rows`).
const ROW_CHUNK = 1000;

// The booking rate's denominator: calls that reached a clear yes or no.
// No-answers, voicemails, errors and call-backs are left out.
const ANSWERED_OUTCOMES = new Set<string>(["appointment_set", "not_interested"]);

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

  // A brand-new agent who has never even started picking a plan lands here
  // (their first stop after login) — send them to the picker once. Anyone
  // who's already got a row (active, trial, expired, canceled — doesn't
  // matter) has already seen it and isn't bounced again; they can always
  // get back to it from Settings.
  if (!session.isAdmin) {
    const billingAccount = await getBillingAccount(session.agent.id);
    if (!billingAccount) redirect("/plans");
  }

  const scope = { requestedAgentId: agentFilter };

  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // The dashboard reports on a rolling 7-day window; the Calls page is where
  // the full history lives.
  const windowStart = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Narrowed to what this page actually reads (stats + the "Recent calls"
  // preview list) — no agent name is shown here, and the full row
  // (transcript, summary, call_insights, etc.) is only needed on the
  // Calls/Notes pages, which fetch their own.
  const CALL_COLUMNS =
    "id, customer_id, status, outcome, duration_seconds, cost, created_at, customer:customers(name)";

  function windowCallsChunk(offset: number) {
    return applyAgentScope(
      supabaseAdmin
        .from("calls")
        .select(CALL_COLUMNS, { count: "exact" })
        .gte("created_at", windowStart),
      session,
      scope
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + ROW_CHUNK - 1);
  }

  const [
    { data: agents },
    { data: appointments },
    firstCalls,
    { data: liveCallData },
    { count: customerCount },
    { count: toCallCount },
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
        // Booked in the window (stats + trend), or still ahead (Next up).
        .or(`created_at.gte.${windowStart},scheduled_at.gt.${nowIso}`)
        .order("scheduled_at", { ascending: false })
        .limit(ROW_CHUNK),
      session,
      scope
    ),
    windowCallsChunk(0),
    // Live calls regardless of age — a call scheduled more than a week ago
    // but still pending must stay cancellable from the banner.
    applyAgentScope(
      supabaseAdmin
        .from("calls")
        .select(CALL_COLUMNS)
        .in("status", [...LIVE_CALL_STATUSES])
        .order("created_at", { ascending: false }),
      session,
      scope
    ),
    // Counts, not rows, so these stay exact past PostgREST's 1000-row cap.
    applyAgentScope(
      supabaseAdmin.from("customers").select("id", { count: "exact", head: true }),
      session,
      scope
    ),
    applyAgentScope(
      supabaseAdmin
        .from("customers")
        .select("id", { count: "exact", head: true })
        // Worth dialling: never contacted, or tried and due a follow-up.
        .in("status", ["new", "follow_up"]),
      session,
      scope
    ),
  ]);

  const windowCallTotal = firstCalls.count ?? firstCalls.data?.length ?? 0;
  const remainingOffsets: number[] = [];
  for (let offset = ROW_CHUNK; offset < windowCallTotal; offset += ROW_CHUNK) {
    remainingOffsets.push(offset);
  }
  const moreCalls = await Promise.all(remainingOffsets.map(windowCallsChunk));

  const appointmentRows = (appointments ?? []) as AppointmentWithRelations[];
  const callRows = [firstCalls, ...moreCalls].flatMap(
    (chunk) => chunk.data ?? []
  ) as CallWithRelations[];

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

  const bookedInWindow = appointmentRows.filter(
    (appointment) => new Date(appointment.created_at).getTime() >= now - WINDOW_DAYS * 86_400_000
  );
  const bookedLast7 = bookedInWindow.length;

  const liveCalls = (liveCallData ?? []) as CallWithRelations[];

  const finishedCalls = callRows.filter((call) => call.status === "ended");
  const wonCalls = finishedCalls.filter(
    (call) => call.outcome === "appointment_set"
  ).length;
  // Booking rate = booked ÷ (booked + not interested). Calls that never got
  // a decision would only drag the rate down without saying anything about
  // the pitch.
  const answeredCalls = finishedCalls.filter(
    (call) => call.outcome !== null && ANSWERED_OUTCOMES.has(call.outcome)
  ).length;
  const bookingRate = answeredCalls
    ? Math.round((wonCalls / answeredCalls) * 100)
    : 0;

  // Every finished call counts here regardless of outcome — a voicemail drop
  // or a screening/gatekeeper message still ties up the line and still costs
  // real Vapi/telephony money, so it belongs in "real" talk time and spend
  // the same as an answered call.
  const totalTalkSeconds = finishedCalls.reduce(
    (sum, call) => sum + (call.duration_seconds ?? 0),
    0
  );
  const totalSpend = finishedCalls.reduce(
    (sum, call) => sum + (call.cost ?? 0),
    0
  );

  const toCall = toCallCount ?? 0;

  const trend = dailyCounts(
    bookedInWindow.map((appointment) => appointment.created_at),
    WINDOW_DAYS,
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
        />
        <StatCard
          label="Customers to call"
          value={toCall}
          icon={Users}
          tone={toCall > 0 ? "warning" : "default"}
          hint={`${(customerCount ?? 0).toLocaleString()} total`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Talk time"
          value={formatDuration(totalTalkSeconds)}
          icon={Timer}
          hint={`${finishedCalls.length.toLocaleString()} completed calls · last 7 days`}
        />
        {session.isAdmin ? (
          <StatCard
            label="Total spent"
            value={formatCost(totalSpend)}
            icon={PhoneOff}
            hint={
              agentFilter
                ? "this agent · last 7 days — Vapi + telephony"
                : "whole team · last 7 days — Vapi + telephony"
            }
          />
        ) : (
          <StatCard
            label="Total calls"
            value={windowCallTotal.toLocaleString()}
            icon={PhoneOff}
            hint={`${finishedCalls.length.toLocaleString()} completed · last 7 days`}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Appointments booked</h2>
            <span className="text-xs text-muted">last 7 days</span>
          </div>
          <TrendBars data={trend} emptyLabel="No appointments booked in the last 7 days." />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Call outcomes</h2>
            <span className="text-xs text-muted">
              {finishedCalls.length.toLocaleString()} calls · last 7 days
            </span>
          </div>
          <RankedBars items={outcomes} emptyLabel="No completed calls in the last 7 days." />
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
                title="No calls in the last 7 days"
                description="Older calls are on the Calls page."
              />
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

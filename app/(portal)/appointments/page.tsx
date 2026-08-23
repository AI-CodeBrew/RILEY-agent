import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  ExternalLink,
  Video,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { StatusBadge } from "@/lib/status-badge";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { FilterPills, SearchInput } from "@/components/Filters";
import { AppointmentActions } from "@/components/AppointmentActions";
import { NewAppointmentButton } from "./NewAppointmentButton";
import type { AppointmentStatus, AppointmentWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

const WHEN_FILTERS = [
  { value: null, label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

const STATUS_FILTERS = [
  { value: null, label: "Any status" },
  { value: "scheduled", label: "Awaiting confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled" },
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    when?: string;
    status?: string;
    agent?: string;
    q?: string;
  }>;
}) {
  const session = await requireSession();
  const { when, status, agent: agentFilter, q } = await searchParams;

  let query = applyAgentScope(
    supabaseAdmin
      .from("appointments")
      .select(
        "*, customer:customers(id, name, phone, email), agent:sales_agents(id, name, email)"
      ),
    session,
    { requestedAgentId: agentFilter }
  );

  const nowIso = new Date().toISOString();
  if (when === "past") {
    query = query.lt("scheduled_at", nowIso).order("scheduled_at", { ascending: false });
  } else if (when === "all") {
    query = query.order("scheduled_at", { ascending: false });
  } else {
    // Default view: what's still ahead, soonest first — the thing an agent
    // actually opens this tab to see.
    query = query.gte("scheduled_at", nowIso).order("scheduled_at", { ascending: true });
  }

  if (status) query = query.eq("status", status as AppointmentStatus);

  const { data, error } = await query;
  let appointments = (data ?? []) as AppointmentWithRelations[];

  // Customer name/phone lives on the joined row, so this one filter is done
  // in memory rather than as a PostgREST `or` across the embed.
  if (q) {
    const term = q.toLowerCase();
    appointments = appointments.filter(
      (appointment) =>
        appointment.customer?.name.toLowerCase().includes(term) ||
        appointment.customer?.phone.includes(term) ||
        appointment.customer?.email?.toLowerCase().includes(term)
    );
  }

  const { data: agents } = session.isAdmin
    ? await supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : { data: null };

  const { data: customers } = await applyAgentScope(
    supabaseAdmin.from("customers").select("id, name").order("name"),
    session,
    { requestedAgentId: agentFilter }
  );

  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcomingCount = appointments.filter(
    (appointment) =>
      new Date(appointment.scheduled_at).getTime() > now &&
      appointment.status !== "canceled"
  ).length;
  const awaitingCount = appointments.filter(
    (appointment) => appointment.status === "scheduled"
  ).length;
  const canceledCount = appointments.filter(
    (appointment) => appointment.status === "canceled" || appointment.status === "no_show"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={
          session.isAdmin
            ? "Every meeting booked across the team — the ones Riley set on a call and the ones agents added by hand."
            : "Every meeting Riley booked, plus anything you added by hand — manage it here instead of hopping into Calendly."
        }
        // Appointments live on an agent's calendar, so only they book and
        // manage them. Admins get the full view without the write actions.
        action={
          session.isAdmin ? undefined : (
            <NewAppointmentButton customers={customers ?? []} />
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming" value={upcomingCount} icon={CalendarClock} />
        <StatCard
          label="Awaiting customer confirmation"
          value={awaitingCount}
          icon={CalendarCheck}
          tone={awaitingCount > 0 ? "warning" : "default"}
          hint="customer hasn't clicked the Calendly link yet"
        />
        <StatCard
          label="Canceled / no-show"
          value={canceledCount}
          icon={CalendarX2}
          tone={canceledCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SearchInput placeholder="Search by customer…" />
        <div className="flex flex-wrap gap-3">
          <FilterPills paramKey="when" options={WHEN_FILTERS} />
          <FilterPills paramKey="status" options={STATUS_FILTERS} />
        </div>
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
        <p className="text-sm text-red-600">
          Failed to load appointments: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {appointments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Customer</th>
                  {session.isAdmin && <th className="px-4 py-3">Agent</th>}
                  <th className="px-4 py-3">Booked by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Meeting</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr
                    key={appointment.id}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap">
                        {formatDateTime(appointment.scheduled_at, session.agent.timezone)}
                      </p>
                      <p className="text-xs text-muted">
                        {formatRelative(appointment.scheduled_at)} ·{" "}
                        {appointment.duration_minutes} min
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {appointment.customer ? (
                        <>
                          <Link
                            href={`/customers/${appointment.customer.id}`}
                            className="font-medium hover:text-accent"
                          >
                            {appointment.customer.name}
                          </Link>
                          {session.isAdmin && (
                            <p className="text-xs text-muted">
                              {formatPhone(appointment.customer.phone)}
                            </p>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {session.isAdmin && (
                      <td className="px-4 py-3 text-muted">
                        {appointment.agent?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <StatusBadge status={appointment.source} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={appointment.status} />
                    </td>
                    <td className="px-4 py-3">
                      {appointment.zoom_link ? (
                        <a
                          href={appointment.zoom_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join link
                        </a>
                      ) : appointment.booking_url && appointment.status === "scheduled" ? (
                        <a
                          href={appointment.booking_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                          title="The one-click Calendly link the customer was emailed"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Confirmation link
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!session.isAdmin && (
                        <AppointmentActions
                          appointment={{
                            id: appointment.id,
                            status: appointment.status,
                            customerName: appointment.customer?.name ?? "this customer",
                            zoomLink: appointment.zoom_link,
                            rescheduleUrl: appointment.reschedule_url,
                            isOver: new Date(appointment.scheduled_at).getTime() < now,
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title={
              when === "past"
                ? "No past appointments"
                : status
                  ? "Nothing matches that filter"
                  : "No upcoming appointments"
            }
            description={
              session.isAdmin
                ? "Riley books these during agents' calls, and agents can add them by hand."
                : "Riley books these during calls — or add one yourself with the button above."
            }
          />
        )}
      </Card>
    </div>
  );
}

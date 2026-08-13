import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  PhoneCall,
  StickyNote,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { StatusBadge } from "@/lib/status-badge";
import {
  formatDateTime,
  formatPhone,
  formatRelative,
} from "@/lib/format";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AppointmentActions } from "@/components/AppointmentActions";
import { TriggerCallPanel } from "./TriggerCallPanel";
import { CustomerEditor } from "./CustomerEditor";
import { CallHistoryList } from "./CallHistoryList";
import { CallNotesCard } from "@/components/CallNotesCard";
import {
  LIVE_CALL_STATUSES,
  type AppointmentWithRelations,
  type Call,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [
    { data: customer },
    { data: calls },
    { data: appointments },
    { data: numberRows },
    { data: routeRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name, email)")
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("calls")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("appointments")
      .select("*, agent:sales_agents(id, name, email)")
      .eq("customer_id", id)
      .order("scheduled_at", { ascending: false }),
    supabaseAdmin
      .from("agent_phone_numbers")
      .select("id, phone_number")
      .eq("agent_id", session.agent.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("agent_number_routes")
      .select("region, phone_number_id")
      .eq("agent_id", session.agent.id),
  ]);

  if (!customer) notFound();

  // Ownership check lives here, next to the data — proxy.ts only knows you're
  // signed in, not whose customer this is.
  if (!session.isAdmin && customer.agent_id !== session.agent.id) {
    notFound();
  }

  // Reassigning ownership is the one write an admin still has here, so they
  // need the roster; agents only ever call as themselves.
  const { data: agentRows } = session.isAdmin
    ? await supabaseAdmin
        .from("sales_agents")
        .select("id, name")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("name")
    : { data: null };

  // Request-time "now" — this page is force-dynamic, so it's evaluated once
  // per request rather than during any client re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const callRows = (calls ?? []) as Call[];
  const appointmentRows = (appointments ?? []) as AppointmentWithRelations[];
  const latestCall = callRows[0] ?? null;
  const latestSummary = latestCall?.summary ?? customer.last_call_summary;
  const latestInsights = latestCall?.call_insights ?? customer.call_insights;
  const liveCall =
    callRows.find((call) =>
      LIVE_CALL_STATUSES.some((status) => status === call.status)
    ) ?? null;

  return (
    <div className="space-y-6">
      <AutoRefresh active={Boolean(liveCall)} intervalMs={10000} />

      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to customers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={customer.name} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {customer.name}
                </h1>
                <StatusBadge
                  status={customer.status}
                  pulse={customer.status === "calling"}
                />
              </div>
              <p className="text-sm text-muted">
                {formatPhone(customer.phone)} · {customer.email ?? "no email"}
                {customer.company ? ` · ${customer.company}` : ""}
              </p>
              {session.isAdmin && (
                <p className="text-xs text-muted">
                  Owner: {customer.agent?.name ?? "unassigned"}
                </p>
              )}
            </div>
          </div>

          <CustomerEditor
            customer={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              company: customer.company,
              notes: customer.notes,
              status: customer.status,
              agent_id: customer.agent_id,
              timezone: customer.timezone,
              province: customer.province,
              kit_count: customer.kit_count,
              mailing_address: customer.mailing_address,
              request_date: customer.request_date,
              date_of_birth: customer.date_of_birth,
              beneficiary_name: customer.beneficiary_name,
              call_type: customer.call_type,
            }}
            agents={
              session.isAdmin
                ? (agentRows ?? []).map((a) => ({ id: a.id, name: a.name }))
                : undefined
            }
          />
        </div>
      </div>

      {!session.isAdmin && (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <PhoneCall className="h-4 w-4 text-accent" />
            Outbound call
          </h2>
          <TriggerCallPanel
            customerId={customer.id}
            customerName={customer.name}
            customerPhone={customer.phone}
            customerStatus={customer.status}
            agent={{
              id: session.agent.id,
              name: session.agent.name,
              calendly_user_uri: session.agent.calendly_user_uri,
              default_voice_gender: session.agent.default_voice_gender,
            }}
            numbers={(numberRows ?? []).map((row) => ({
              id: row.id,
              phoneNumber: row.phone_number,
            }))}
            routes={routeRows ?? []}
            liveCall={liveCall}
            timezone={session.agent.timezone}
          />
        </Card>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-accent" />
          Appointments
        </h2>
        <Card className="overflow-visible">
          {appointmentRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Booked by</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {appointmentRows.map((appointment) => (
                    <tr
                      key={appointment.id}
                      className="border-b border-border last:border-0 hover:bg-background"
                    >
                      <td className="px-4 py-3">
                        <p>{formatDateTime(appointment.scheduled_at, session.agent.timezone)}</p>
                        <p className="text-xs text-muted">
                          {formatRelative(appointment.scheduled_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3">{appointment.agent?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={appointment.source} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={appointment.status} />
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentActions
                          appointment={{
                            id: appointment.id,
                            status: appointment.status,
                            customerName: customer.name,
                            zoomLink: appointment.zoom_link,
                            rescheduleUrl: appointment.reschedule_url,
                            isOver:
                              new Date(appointment.scheduled_at).getTime() < now,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No appointments yet"
              description="Appointments booked by Riley — or added by hand — show up here."
            />
          )}
        </Card>
      </section>

      {customer.notes && (
        <Card className="flex gap-2.5 p-4">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
        </Card>
      )}

      {(latestSummary || latestInsights) && (
        <Card className="p-4">
          <CallNotesCard
            title="Latest call notes & insights"
            summary={latestSummary}
            callInsights={latestInsights}
          />
          {latestCall && (
            <p className="mt-3 text-xs text-muted">
              From call on {formatDateTime(latestCall.created_at, session.agent.timezone)}
              {" · "}
              {formatRelative(latestCall.created_at)}
            </p>
          )}
        </Card>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4 text-accent" />
          Call history
        </h2>
        <CallHistoryList calls={callRows} timezone={session.agent.timezone} />
      </section>

    </div>
  );
}

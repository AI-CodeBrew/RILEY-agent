import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, PhoneCall, Video } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { StatusBadge } from "@/lib/status-badge";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { TriggerCallPanel } from "./TriggerCallPanel";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: customer }, { data: agents }, { data: calls }, { data: appointments }] =
    await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", id).single(),
      supabaseAdmin
        .from("sales_agents")
        .select("id, name, calendly_user_uri")
        .order("name"),
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
    ]);

  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to customers
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={customer.name} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {customer.name}
              </h1>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-muted">
              {customer.phone} · {customer.email ?? "no email"}
            </p>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4 text-accent" />
          Trigger outbound call
        </h2>
        <TriggerCallPanel customerId={customer.id} agents={agents ?? []} />
      </Card>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-accent" />
          Appointments
        </h2>
        <Card className="overflow-hidden">
          {appointments && appointments.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Zoom</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr
                    key={appt.id}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      {new Date(appt.scheduled_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{appt.agent?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={appt.status} />
                    </td>
                    <td className="px-4 py-3">
                      {appt.zoom_link ? (
                        <a
                          href={appt.zoom_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join link
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No appointments yet"
              description="Appointments booked by the voice agent will show up here."
            />
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4 text-accent" />
          Call history
        </h2>
        {calls && calls.length > 0 ? (
          <div className="space-y-3">
            {calls.map((call) => (
              <Card key={call.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">
                    {new Date(call.created_at).toLocaleString()}
                  </span>
                  <StatusBadge status={call.outcome} />
                </div>
                {call.transcript && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {call.transcript}
                  </p>
                )}
                {call.recording_url && (
                  <audio
                    controls
                    src={call.recording_url}
                    className="mt-3 h-9 w-full"
                  />
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={PhoneCall}
              title="No calls yet"
              description="Trigger a call above to get started."
            />
          </Card>
        )}
      </section>
    </div>
  );
}

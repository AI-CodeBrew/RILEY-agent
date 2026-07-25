import Link from "next/link";
import { CalendarCheck, CalendarClock, CheckCircle2, Video } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { StatusBadge } from "@/lib/status-badge";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentFilter } = await searchParams;

  const { data: agents } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name")
    .order("name");

  let query = supabaseAdmin
    .from("appointments")
    .select("*, customer:customers(id, name, phone, email), agent:sales_agents(id, name, email)")
    .order("scheduled_at", { ascending: false });

  if (agentFilter) {
    query = query.eq("agent_id", agentFilter);
  }

  const { data: appointments, error } = await query;

  const total = appointments?.length ?? 0;
  const upcoming =
    appointments?.filter(
      (a) => new Date(a.scheduled_at) > new Date() && a.status !== "canceled"
    ).length ?? 0;
  const confirmed =
    appointments?.filter((a) => a.status === "confirmed" || a.status === "completed")
      .length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Appointments booked by the voice agent."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total appointments" value={total} icon={CalendarClock} />
        <StatCard label="Upcoming" value={upcoming} icon={CalendarCheck} />
        <StatCard label="Confirmed / completed" value={confirmed} icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            !agentFilter
              ? "bg-accent text-accent-foreground"
              : "border border-border text-muted hover:text-foreground"
          )}
        >
          All agents
        </Link>
        {agents?.map((agent) => (
          <Link
            key={agent.id}
            href={`/dashboard?agent=${agent.id}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              agentFilter === agent.id
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted hover:text-foreground"
            )}
          >
            {agent.name}
          </Link>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Failed to load appointments: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {appointments && appointments.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Customer</th>
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
                  <td className="px-4 py-3">
                    {appt.customer ? (
                      <Link
                        href={`/customers/${appt.customer.id}`}
                        className="text-accent hover:underline"
                      >
                        {appt.customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
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
    </div>
  );
}

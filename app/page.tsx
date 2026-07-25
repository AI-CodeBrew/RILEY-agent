import { CalendarClock, LayoutDashboard, PhoneCall, Users, UserRound } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { LinkButton } from "@/components/Button";

export const dynamic = "force-dynamic";

const ACTIONS = [
  {
    href: "/customers",
    icon: Users,
    title: "Customers",
    description: "Add customers and trigger outbound booking calls.",
  },
  {
    href: "/agents",
    icon: UserRound,
    title: "Sales Agents",
    description: "Manage agents and connect their Calendly calendars.",
  },
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "See appointments booked by the voice agent.",
  },
];

export default async function Home() {
  const [{ count: customerCount }, { count: agentCount }, { count: appointmentCount }] =
    await Promise.all([
      supabaseAdmin.from("customers").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("sales_agents").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("appointments").select("*", { count: "exact", head: true }),
    ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <PhoneCall className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Riley Booking</h1>
          <p className="text-sm text-muted">
            Outbound voice-agent appointment booking portal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Customers" value={customerCount ?? 0} icon={Users} />
        <StatCard label="Sales agents" value={agentCount ?? 0} icon={UserRound} />
        <StatCard label="Appointments" value={appointmentCount ?? 0} icon={CalendarClock} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <Card key={action.href} className="flex flex-col gap-3 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <action.icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-medium">{action.title}</h2>
              <p className="mt-1 text-sm text-muted">{action.description}</p>
            </div>
            <LinkButton href={action.href} variant="secondary" className="mt-auto self-start">
              Open
            </LinkButton>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { CalendarCheck, CalendarDays, KeyRound, Puzzle, Route } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";
import type { CalendarProvider } from "@/types/database";
import { BookingCalendarPicker } from "../BookingCalendarPicker";

export const dynamic = "force-dynamic";

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={
        connected
          ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500"
      }
    >
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export default async function IntegrationsPage() {
  const session = await requireSession();
  const { agent } = session;

  if (session.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Integrations & apps"
          description="What Riley and this portal connect to. Manage credentials from Settings."
        />
        <Card>
          <EmptyState
            icon={Puzzle}
            title="Admins have no integrations of their own"
            description="Calendars and Twilio are connected per selling agent."
          />
        </Card>
      </div>
    );
  }

  const [{ count: hoursCount }, { data: googleConnection }] = await Promise.all([
    supabaseAdmin
      .from("agent_availability_hours")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id),
    supabaseAdmin
      .from("google_calendar_connections")
      .select("availability_calendar_id")
      .eq("agent_id", agent.id)
      .maybeSingle(),
  ]);
  const hasHours = (hoursCount ?? 0) > 0;
  const calendlyConnected = Boolean(agent.calendly_user_uri);

  // Same rule the booking edge functions use when no calendar was picked.
  const inferred: CalendarProvider | null = hasHours ? "crm" : calendlyConnected ? "calendly" : null;
  const currentProvider = agent.calendar_provider ?? inferred;

  const missing: Partial<Record<CalendarProvider, string>> = {};
  if (!googleConnection) {
    missing.google = "Connect Google Calendar in Settings first.";
  } else if (!googleConnection.availability_calendar_id && !hasHours) {
    missing.google = "Pick your availability calendar in Settings → Google Calendar first.";
  }
  if (!calendlyConnected) missing.calendly = "Connect Calendly in Settings first.";
  if (!hasHours) missing.crm = "Set weekly hours on Calendar → Availability first.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations & apps"
        description="What Riley and this portal connect to, and which calendar Riley books on."
      />

      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Route className="h-4 w-4 text-accent" />
          Booking calendar
        </h2>
        <p className="mb-4 text-xs text-muted">
          Where Riley checks your availability and books meetings while on a call.
        </p>
        <BookingCalendarPicker agentId={agent.id} current={currentProvider} missing={missing} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold">Google Calendar</h2>
          </div>
          <p className="text-xs text-muted">
            Riley reads your free blocks from Google and puts bookings on your
            Google Calendar when it&apos;s your booking calendar.
          </p>
          <StatusPill connected={Boolean(googleConnection)} />
          <LinkButton href="/settings" variant="secondary" size="sm" className="w-fit">
            Manage
          </LinkButton>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold">Calendly</h2>
          </div>
          <p className="text-xs text-muted">
            Riley reads your real availability and books here when Calendly is
            your booking calendar.
          </p>
          <StatusPill connected={calendlyConnected} />
          <LinkButton href="/settings" variant="secondary" size="sm" className="w-fit">
            Manage
          </LinkButton>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold">Twilio</h2>
          </div>
          <p className="text-xs text-muted">
            Your own Twilio account, separate from the shared business
            account used for number provisioning.
          </p>
          <StatusPill connected={Boolean(agent.twilio_account_sid)} />
          <LinkButton href="/settings" variant="secondary" size="sm" className="w-fit">
            Manage
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}

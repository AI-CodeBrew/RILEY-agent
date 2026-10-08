import { Clock } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { canadaTimezoneLabel } from "@/lib/canada-timezones";
import { AvailabilityEditor } from "../AvailabilityEditor";
import { BookingWindowForm } from "../BookingWindowForm";
import type { AgentAvailabilityHour } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const session = await requireSession();

  if (session.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Availability"
          description="Weekly hours belong to the agent selling on their own calendar."
        />
        <Card>
          <EmptyState
            icon={Clock}
            title="Admins don't set availability"
            description="Sign in as an agent to set weekly working hours."
          />
        </Card>
      </div>
    );
  }

  const { data } = await supabaseAdmin
    .from("agent_availability_hours")
    .select("id, weekday, start_time, end_time")
    .eq("agent_id", session.agent.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  const hours = (data ?? []) as Pick<
    AgentAvailabilityHour,
    "id" | "weekday" | "start_time" | "end_time"
  >[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Saving hours here switches Riley to booking directly off this schedule for you — no Calendly involved. Leave it empty to keep using your connected Calendly account instead."
      />

      {/* Side by side on wide screens — weekly hours on the left, the booking
          window that limits them on the right; stacked on narrow ones. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-5">
          <AvailabilityEditor
            agentId={session.agent.id}
            initialHours={hours}
            timezoneLabel={canadaTimezoneLabel(session.agent.timezone)}
          />
        </Card>

        <Card className="p-5">
          <BookingWindowForm
            agentId={session.agent.id}
            initialDays={session.agent.booking_window_days ?? null}
          />
        </Card>
      </div>
    </div>
  );
}

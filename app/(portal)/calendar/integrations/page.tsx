import { CalendarCheck, KeyRound, Puzzle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations & apps"
        description="What Riley and this portal connect to. Manage credentials from Settings."
      />

      {session.isAdmin ? (
        <Card>
          <EmptyState
            icon={Puzzle}
            title="Admins have no integrations of their own"
            description="Calendly and Twilio are connected per selling agent."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold">Calendly</h2>
            </div>
            <p className="text-xs text-muted">
              Riley reads your real availability and books here — this is the
              calendar customers actually land on.
            </p>
            <StatusPill connected={Boolean(agent.calendly_user_uri)} />
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
      )}
    </div>
  );
}

import { CalendarClock, Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getBillingAccount, planIncludesCalendar } from "@/lib/billing";
import { EmptyState } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";
import { CalendarSubNav } from "./CalendarSubNav";

/**
 * Every /calendar/* screen shares this left-hand sub-nav (Meetings /
 * Availability / Integrations & apps) — the calendar module's own
 * navigation, nested inside the portal's main sidebar.
 *
 * Also the server-side gate for the Standard plan's calendar exclusion —
 * hiding the nav link (see the portal layout's hasCalendarAccess) stops a
 * casual click, but this is what actually blocks typing /calendar in
 * directly. Admins and every other plan pass straight through.
 */
export default async function CalendarLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.isAdmin) {
    const account = await getBillingAccount(session.agent.id);
    if (account?.status === "active" && !planIncludesCalendar(account.plan)) {
      return (
        <EmptyState
          icon={CalendarClock}
          title="Calendar isn't included on your plan"
          description="Upgrade to Pro to book and manage meetings directly in Riley."
          action={
            <LinkButton href="/plans">
              <Sparkles className="h-3.5 w-3.5" />
              View plans
            </LinkButton>
          }
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <CalendarSubNav />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}

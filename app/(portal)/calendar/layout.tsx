import { CalendarSubNav } from "./CalendarSubNav";

/**
 * Every /calendar/* screen shares this left-hand sub-nav (Meetings /
 * Availability / Integrations & apps) — the calendar module's own
 * navigation, nested inside the portal's main sidebar.
 */
export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <CalendarSubNav />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}

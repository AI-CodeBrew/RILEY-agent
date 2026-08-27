"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarClock, LayoutGrid, List } from "lucide-react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { FilterPills } from "@/components/Filters";
import { STATUS_STYLES } from "@/lib/status-badge";
import { cn } from "@/lib/cn";
import { AppointmentDetailModal } from "./AppointmentDetailModal";
import { formatTimeRange, zonedDateString } from "./calendar-dates";
import type { MeetingsRange } from "./page";
import type { AppointmentWithRelations } from "@/types/database";

const RANGE_OPTIONS: { value: MeetingsRange; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "This week" },
  { value: "lastweek", label: "Last week" },
];

function dayHeaderLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function MeetingsView({
  range,
  anchor,
  today,
  rangeLabel,
  timezone,
  isAdmin,
  appointments,
  agents,
}: {
  range: MeetingsRange;
  /** "YYYY-MM-DD" the date-jump input is set to. */
  anchor: string;
  today: string;
  rangeLabel: string;
  timezone: string;
  isAdmin: boolean;
  appointments: AppointmentWithRelations[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<AppointmentWithRelations | null>(null);

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function selectRange(next: MeetingsRange) {
    setParams({ range: next, date: next === "upcoming" || next === "lastweek" ? null : today });
  }

  function jumpToDate(dateStr: string) {
    if (!dateStr) return;
    setParams({ range: "day", date: dateStr });
  }

  const byDay = new Map<string, AppointmentWithRelations[]>();
  for (const appointment of appointments) {
    const key = zonedDateString(new Date(appointment.scheduled_at), timezone);
    const list = byDay.get(key);
    if (list) list.push(appointment);
    else byDay.set(key, [appointment]);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={anchor}
            onChange={(e) => jumpToDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            aria-label="Jump to date"
          />
          <h2 className="text-sm font-semibold">{rangeLabel}</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectRange(option.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  range === option.value
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border p-0.5">
            <span
              aria-current="page"
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground"
            >
              <List className="h-3.5 w-3.5" />
              List
            </span>
            <Link
              href="/calendar/grid"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </Link>
          </div>
        </div>
      </div>

      {/* Small screens: the pills row above is hidden to save space, so repeat it below full-width. */}
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => selectRange(option.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              range === option.value
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isAdmin && agents.length > 0 && (
        <FilterPills
          paramKey="agent"
          options={[
            { value: null, label: "All agents" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
      )}

      <p className="text-xs text-muted">
        Displaying {appointments.length} meeting{appointments.length === 1 ? "" : "s"}
      </p>

      {appointments.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No meetings here"
            description={
              range === "upcoming"
                ? "Riley books these during calls — or add one from Appointments."
                : "Nothing booked in this range."
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {dayHeaderLabel(day)}
              </h3>
              <Card className="divide-y divide-border overflow-hidden">
                {byDay.get(day)!.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => setSelected(appointment)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-background"
                  >
                    <span className="w-32 shrink-0 text-muted">
                      {formatTimeRange(appointment.scheduled_at, appointment.duration_minutes, timezone)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-2 w-2 shrink-0 rounded-full",
                        STATUS_STYLES[appointment.status] ?? "bg-zinc-500/10 text-zinc-600"
                      )}
                    >
                      <span className="h-full w-full rounded-full bg-current" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">
                        {appointment.customer?.name ?? "New meeting"}
                      </span>
                      {isAdmin && appointment.agent && (
                        <span className="text-muted"> with {appointment.agent.name}</span>
                      )}
                    </span>
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      <AppointmentDetailModal
        appointment={selected}
        timezone={timezone}
        isAdmin={isAdmin}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

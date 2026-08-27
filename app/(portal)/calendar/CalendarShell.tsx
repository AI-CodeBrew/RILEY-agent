"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { FilterPills } from "@/components/Filters";
import { useToast } from "@/components/Toast";
import { CANADA_TIME_ZONES, type CanadaTimezoneIana, normalizeCanadaTimezone } from "@/lib/canada-timezones";
import {
  addDays,
  addMonths,
  startOfMonthGrid,
  startOfWeek,
  type CalendarView,
} from "./calendar-dates";
import { MonthGrid } from "./MonthGrid";
import { WeekGrid } from "./WeekGrid";
import { DayGrid } from "./DayGrid";
import { AppointmentDetailModal } from "./AppointmentDetailModal";
import type { AppointmentWithRelations } from "@/types/database";

function monthLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}`;
}

const VIEW_TABS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

export function CalendarShell({
  view,
  date,
  today,
  timezone,
  agentId,
  isAdmin,
  appointments,
  agents,
}: {
  view: CalendarView;
  date: string;
  today: string;
  timezone: string;
  /** The signed-in session's own sales_agents.id — PATCHed when the time zone selector changes. */
  agentId: string;
  isAdmin: boolean;
  appointments: AppointmentWithRelations[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState<AppointmentWithRelations | null>(null);
  const [savingTimezone, setSavingTimezone] = useState(false);

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function goToView(nextView: CalendarView) {
    setParams({ view: nextView });
  }

  function step(direction: -1 | 1) {
    if (view === "month") {
      setParams({ date: addMonths(date, direction) });
    } else if (view === "week") {
      setParams({ date: addDays(date, direction * 7) });
    } else {
      setParams({ date: addDays(date, direction) });
    }
  }

  function goToToday() {
    setParams({ date: today });
  }

  async function handleTimezoneChange(iana: CanadaTimezoneIana) {
    setSavingTimezone(true);
    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: iana }),
    });
    setSavingTimezone(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save time zone.", "error");
      return;
    }
    router.refresh();
  }

  function selectDay(dateStr: string) {
    setParams({ view: "day", date: dateStr });
  }

  const title =
    view === "month"
      ? monthLabel(date)
      : view === "week"
        ? weekLabel(startOfWeek(date))
        : dayLabel(date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold">{title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-border p-0.5">
            <Link
              href="/calendar"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <List className="h-3.5 w-3.5" />
              List
            </Link>
          </div>

          <div className="flex rounded-lg border border-border p-0.5">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => goToView(tab.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === tab.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <SelectField
            label="Time zone"
            value={normalizeCanadaTimezone(timezone)}
            onChange={(e) => handleTimezoneChange(e.target.value as CanadaTimezoneIana)}
            disabled={savingTimezone}
            className="w-auto"
          >
            {CANADA_TIME_ZONES.map((zone) => (
              <option key={zone.iana} value={zone.iana}>
                {zone.label}
              </option>
            ))}
          </SelectField>
        </div>
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

      {view === "month" && (
        <MonthGrid
          gridStart={startOfMonthGrid(date)}
          focusMonth={date.slice(0, 7)}
          timezone={timezone}
          today={today}
          appointments={appointments}
          onSelectAppointment={setSelected}
          onSelectDay={selectDay}
        />
      )}
      {view === "week" && (
        <WeekGrid
          weekStart={startOfWeek(date)}
          timezone={timezone}
          today={today}
          appointments={appointments}
          onSelectAppointment={setSelected}
        />
      )}
      {view === "day" && (
        <DayGrid
          date={date}
          timezone={timezone}
          today={today}
          appointments={appointments}
          onSelectAppointment={setSelected}
        />
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

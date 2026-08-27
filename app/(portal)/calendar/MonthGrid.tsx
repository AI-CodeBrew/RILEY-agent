"use client";

import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "@/lib/status-badge";
import { formatTime } from "@/lib/format";
import { addDays, zonedDateString, WEEKDAY_LABELS } from "./calendar-dates";
import type { AppointmentWithRelations } from "@/types/database";

const CHIP_LIMIT = 3;

export function MonthGrid({
  gridStart,
  focusMonth,
  timezone,
  today,
  appointments,
  onSelectAppointment,
  onSelectDay,
}: {
  /** "YYYY-MM-DD" — the Sunday that starts the 6-week grid (see startOfMonthGrid). */
  gridStart: string;
  /** "YYYY-MM" — days outside this month render dimmed. */
  focusMonth: string;
  timezone: string;
  today: string;
  appointments: AppointmentWithRelations[];
  onSelectAppointment: (appointment: AppointmentWithRelations) => void;
  onSelectDay: (dateStr: string) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const byDay = new Map<string, AppointmentWithRelations[]>();
  for (const appointment of appointments) {
    const key = zonedDateString(new Date(appointment.scheduled_at), timezone);
    const list = byDay.get(key);
    if (list) list.push(appointment);
    else byDay.set(key, [appointment]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-background text-xs font-medium uppercase tracking-wide text-muted">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === focusMonth;
          const isToday = day === today;
          const dayAppointments = byDay.get(day) ?? [];
          const visible = dayAppointments.slice(0, CHIP_LIMIT);
          const overflow = dayAppointments.length - visible.length;

          return (
            <div
              key={day}
              className={cn(
                "min-h-24 border-b border-r border-border p-1.5 last:border-r-0",
                !inMonth && "bg-background/50"
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className={cn(
                  "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium hover:bg-background",
                  !inMonth && "text-muted",
                  isToday && "bg-accent text-accent-foreground hover:opacity-90"
                )}
              >
                {Number(day.slice(8, 10))}
              </button>
              <div className="space-y-1">
                {visible.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => onSelectAppointment(appointment)}
                    className={cn(
                      "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:opacity-80",
                      STATUS_STYLES[appointment.status] ?? "bg-zinc-500/10 text-zinc-600"
                    )}
                  >
                    {formatTime(appointment.scheduled_at, timezone)}{" "}
                    {appointment.customer?.name ?? "—"}
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-muted hover:text-foreground"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

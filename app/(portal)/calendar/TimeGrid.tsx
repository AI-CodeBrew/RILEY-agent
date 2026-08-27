"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "@/lib/status-badge";
import { formatTime } from "@/lib/format";
import { zonedDateString, zonedParts } from "./calendar-dates";
import type { AppointmentWithRelations } from "@/types/database";

/** 48px per hour — matches Google Calendar's default density closely enough to read comfortably. */
const PX_PER_MINUTE = 0.8;
const DAY_HEIGHT = 24 * 60 * PX_PER_MINUTE;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

function weekdayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Shared hour-row time grid behind both Week and Day views (see
 * WeekGrid.tsx/DayGrid.tsx) — Week is just this with 7 day columns, Day is
 * this with 1, so the actual positioning math lives in exactly one place.
 */
export function TimeGrid({
  days,
  timezone,
  today,
  appointments,
  onSelectAppointment,
}: {
  days: string[];
  timezone: string;
  today: string;
  appointments: AppointmentWithRelations[];
  onSelectAppointment: (appointment: AppointmentWithRelations) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open scrolled to the start of the working day rather than midnight.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, 7 * 60 * PX_PER_MINUTE - 40) });
  }, []);

  const byDay = new Map<string, AppointmentWithRelations[]>();
  for (const appointment of appointments) {
    const key = zonedDateString(new Date(appointment.scheduled_at), timezone);
    const list = byDay.get(key);
    if (list) list.push(appointment);
    else byDay.set(key, [appointment]);
  }

  const now = new Date();
  const nowParts = zonedParts(now, timezone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const nowDay = zonedDateString(now, timezone);

  const columns = `4rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div
        className="grid border-b border-border bg-background text-xs font-medium text-muted"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day}
            className={cn("px-2 py-2 text-center", day === today && "font-semibold text-accent")}
          >
            {weekdayLabel(day)}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[32rem] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height: DAY_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted"
                style={{ top: hour * 60 * PX_PER_MINUTE }}
              >
                {hour > 0 && hourLabel(hour)}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayAppointments = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className="relative border-l border-border"
                style={{ height: DAY_HEIGHT }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/60"
                    style={{ top: hour * 60 * PX_PER_MINUTE }}
                  />
                ))}
                {day === nowDay && (
                  <div
                    className="absolute left-0 right-0 z-10 border-t-2 border-red-500"
                    style={{ top: nowMinutes * PX_PER_MINUTE }}
                  />
                )}
                {dayAppointments.map((appointment) => {
                  const parts = zonedParts(new Date(appointment.scheduled_at), timezone);
                  const top = (parts.hour * 60 + parts.minute) * PX_PER_MINUTE;
                  const height = Math.max(appointment.duration_minutes * PX_PER_MINUTE, 18);
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onSelectAppointment(appointment)}
                      className={cn(
                        "absolute left-1 right-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] font-medium shadow-sm hover:opacity-80",
                        STATUS_STYLES[appointment.status] ?? "bg-zinc-500/10 text-zinc-600"
                      )}
                      style={{ top, height }}
                    >
                      <span className="block truncate">
                        {formatTime(appointment.scheduled_at, timezone)}{" "}
                        {appointment.customer?.name ?? "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

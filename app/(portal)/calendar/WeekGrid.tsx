"use client";

import { TimeGrid } from "./TimeGrid";
import { addDays } from "./calendar-dates";
import type { AppointmentWithRelations } from "@/types/database";

export function WeekGrid({
  weekStart,
  timezone,
  today,
  appointments,
  onSelectAppointment,
}: {
  /** "YYYY-MM-DD" — the Sunday that starts this week (see startOfWeek). */
  weekStart: string;
  timezone: string;
  today: string;
  appointments: AppointmentWithRelations[];
  onSelectAppointment: (appointment: AppointmentWithRelations) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <TimeGrid
      days={days}
      timezone={timezone}
      today={today}
      appointments={appointments}
      onSelectAppointment={onSelectAppointment}
    />
  );
}

"use client";

import { TimeGrid } from "./TimeGrid";
import type { AppointmentWithRelations } from "@/types/database";

export function DayGrid({
  date,
  timezone,
  today,
  appointments,
  onSelectAppointment,
}: {
  /** "YYYY-MM-DD" */
  date: string;
  timezone: string;
  today: string;
  appointments: AppointmentWithRelations[];
  onSelectAppointment: (appointment: AppointmentWithRelations) => void;
}) {
  return (
    <TimeGrid
      days={[date]}
      timezone={timezone}
      today={today}
      appointments={appointments}
      onSelectAppointment={onSelectAppointment}
    />
  );
}

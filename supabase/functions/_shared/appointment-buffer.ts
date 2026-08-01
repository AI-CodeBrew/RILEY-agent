/** Ensures 30-min meetings with a 30-min buffer between appointments. */
export const MEETING_MINUTES = 30;
export const BUFFER_MINUTES = 30;

type ExistingAppointment = {
  scheduled_at: string;
  duration_minutes: number | null;
};

export function slotConflictsWithAppointments(
  slotStartIso: string,
  existing: ExistingAppointment[],
  meetingMinutes = MEETING_MINUTES,
  bufferMinutes = BUFFER_MINUTES
) {
  const slotStart = new Date(slotStartIso).getTime();
  const slotEnd = slotStart + meetingMinutes * 60_000;
  const bufferMs = bufferMinutes * 60_000;

  for (const appt of existing) {
    const apptStart = new Date(appt.scheduled_at).getTime();
    const apptEnd = apptStart + (appt.duration_minutes ?? MEETING_MINUTES) * 60_000;
    const overlaps = slotStart < apptEnd + bufferMs && slotEnd + bufferMs > apptStart;
    if (overlaps) return true;
  }
  return false;
}

export function filterSlotsWithBuffer<T extends { start_time: string }>(
  slots: T[],
  existing: ExistingAppointment[],
  meetingMinutes = MEETING_MINUTES,
  bufferMinutes = BUFFER_MINUTES
): T[] {
  return slots.filter(
    (slot) => !slotConflictsWithAppointments(slot.start_time, existing, meetingMinutes, bufferMinutes)
  );
}

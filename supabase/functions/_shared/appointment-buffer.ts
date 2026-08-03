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

/** Matches a requested ISO time to a Calendly slot within tolerance (ms/format drift). */
export function matchAvailableSlot(
  requestedStartIso: string,
  availableTimes: { start_time: string }[],
  toleranceMs = 90_000
): { start_time: string } | null {
  const requestedMs = new Date(requestedStartIso).getTime();
  if (Number.isNaN(requestedMs)) return null;

  let best: { start_time: string; diff: number } | null = null;
  for (const slot of availableTimes) {
    const slotMs = new Date(slot.start_time).getTime();
    if (Number.isNaN(slotMs)) continue;
    const diff = Math.abs(slotMs - requestedMs);
    if (diff <= toleranceMs && (!best || diff < best.diff)) {
      best = { start_time: slot.start_time, diff };
    }
  }
  return best ? { start_time: best.start_time } : null;
}

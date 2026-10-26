// Cancels one appointment row: marks it canceled in the DB and, if it has a
// real Calendly or Google Calendar event behind it, cancels that too — the same rule the
// portal's own cancel endpoint follows (app/api/appointments/[id]/route.ts),
// so a canceled appointment never leaves a stale, still-confirmed slot
// sitting on the agent's real calendar.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import { decryptToken } from "./token-crypto.ts";
import { cancelCalendlyEvent, isCalendlyEventUri } from "./calendly.ts";
import { deleteGoogleCalendarEvent, getGoogleCalendarAccess } from "./google-calendar.ts";

export async function cancelAppointmentRow(
  appointment: {
    id: string;
    agent_id: string | null;
    calendly_event_uri: string | null;
    google_event_id?: string | null;
    google_calendar_id?: string | null;
  },
  reason: string
): Promise<{ calendlyWarning: string | null; googleCalendarWarning: string | null }> {
  const supabase = getSupabaseAdmin();
  let calendlyWarning: string | null = null;
  let googleCalendarWarning: string | null = null;

  if (isCalendlyEventUri(appointment.calendly_event_uri)) {
    const { data: agent } = await supabase
      .from("sales_agents")
      .select("calendly_access_token")
      .eq("id", appointment.agent_id ?? "")
      .maybeSingle();

    if (agent?.calendly_access_token) {
      try {
        await cancelCalendlyEvent(
          (await decryptToken(agent.calendly_access_token))!,
          appointment.calendly_event_uri!,
          reason
        );
      } catch (err) {
        // Still cancel on our side — a stale Calendly event is better than a
        // portal/appointment record that says "confirmed" for a dead meeting.
        console.error(`Calendly cancellation failed for appointment ${appointment.id}:`, err);
        calendlyWarning =
          "Calendly rejected the cancellation — the agent's real calendar may still show this event.";
      }
    }
  }

  if (appointment.google_event_id && appointment.agent_id) {
    try {
      const google = await getGoogleCalendarAccess(appointment.agent_id);
      if (!google) throw new Error("Google Calendar is no longer connected");
      await deleteGoogleCalendarEvent(
        google.accessToken,
        appointment.google_calendar_id ?? google.connection.booking_calendar_id,
        appointment.google_event_id
      );
    } catch (err) {
      // Same rule as Calendly above: cancel on our side regardless.
      console.error(`Google Calendar cancellation failed for appointment ${appointment.id}:`, err);
      googleCalendarWarning =
        "Google Calendar rejected the cancellation — the agent's Google Calendar may still show this event.";
    }
  }

  await supabase
    .from("appointments")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_reason: reason,
    })
    .eq("id", appointment.id);

  return { calendlyWarning, googleCalendarWarning };
}

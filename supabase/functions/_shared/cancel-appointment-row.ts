// Cancels one appointment row: marks it canceled in the DB and, if it has a
// real Calendly event behind it, cancels that too — the same rule the
// portal's own cancel endpoint follows (app/api/appointments/[id]/route.ts),
// so a canceled appointment never leaves a stale, still-confirmed slot
// sitting on the agent's real calendar.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import { decryptToken } from "./token-crypto.ts";
import { cancelCalendlyEvent, isCalendlyEventUri } from "./calendly.ts";

export async function cancelAppointmentRow(
  appointment: { id: string; agent_id: string | null; calendly_event_uri: string | null },
  reason: string
): Promise<{ calendlyWarning: string | null }> {
  const supabase = getSupabaseAdmin();
  let calendlyWarning: string | null = null;

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

  await supabase
    .from("appointments")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_reason: reason,
    })
    .eq("id", appointment.id);

  return { calendlyWarning };
}

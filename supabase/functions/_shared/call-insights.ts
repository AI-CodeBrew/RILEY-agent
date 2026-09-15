// Keeps calls.call_insights / calls.outcome in sync with what actually got
// booked on this call — read by the portal (customer detail page, campaign
// review) as the record of what the voice agent did. Extracted out of
// book-appointment/index.ts so cancel-appointment can share the exact same
// "find the call this booking belongs to" lookup and reverse the fields it
// sets, instead of drifting out of sync with a second copy of the query.

import { getSupabaseAdmin } from "./supabase-admin.ts";

async function findActiveCall(customerId: string, agentId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("calls")
    .select("id, call_insights")
    .eq("customer_id", customerId)
    .eq("agent_id", agentId)
    .in("status", ["queued", "ringing", "in_progress", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function markActiveCallAppointmentSet(
  customerId: string,
  agentId: string,
  scheduledAtIso: string,
  agentName: string,
  bookingNotes?: string
) {
  const activeCall = await findActiveCall(customerId, agentId);
  if (!activeCall) return;

  const supabase = getSupabaseAdmin();
  const priorInsights =
    activeCall.call_insights && typeof activeCall.call_insights === "object"
      ? (activeCall.call_insights as Record<string, unknown>)
      : {};

  await supabase
    .from("calls")
    .update({
      outcome: "appointment_set",
      call_insights: {
        ...priorInsights,
        outcome: "appointment_set",
        appointment_with: agentName,
        appointment_at: scheduledAtIso,
        meeting_locked_time: scheduledAtIso,
        ...(bookingNotes ? { key_notes: bookingNotes } : {}),
      },
    })
    .eq("id", activeCall.id);
}

/**
 * Inverse of markActiveCallAppointmentSet — run whenever a previously
 * successful booking gets canceled mid-call (the customer said the time was
 * wrong, or a new booking supersedes it). Clears the appointment-shaped
 * fields so, if the call ends before a replacement is booked, call_insights
 * doesn't keep reporting an appointment that no longer exists.
 */
export async function clearActiveCallAppointmentInsights(customerId: string, agentId: string) {
  const activeCall = await findActiveCall(customerId, agentId);
  if (!activeCall) return;

  const supabase = getSupabaseAdmin();
  const priorInsights =
    activeCall.call_insights && typeof activeCall.call_insights === "object"
      ? (activeCall.call_insights as Record<string, unknown>)
      : {};

  const clearedInsights: Record<string, unknown> = { ...priorInsights };
  delete clearedInsights.appointment_with;
  delete clearedInsights.appointment_at;
  delete clearedInsights.meeting_locked_time;

  await supabase
    .from("calls")
    .update({ outcome: null, call_insights: clearedInsights })
    .eq("id", activeCall.id);
}

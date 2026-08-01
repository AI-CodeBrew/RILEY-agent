// Edge Function: book-appointment
//
// Called by the Vapi assistant once the customer confirms a specific time.
// Uses Calendly's Scheduling API (POST /invitees) to book directly on the
// agent's calendar with the customer's name — no email link, no redirect.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import {
  createEventInvitee,
  getAvailableTimes,
  getScheduledEvent,
  listEventTypes,
} from "../_shared/calendly.ts";
import {
  MEETING_MINUTES,
  slotConflictsWithAppointments,
} from "../_shared/appointment-buffer.ts";

/** Calendly requires an email on the invitee record; we do not send mail ourselves. */
function calendlyInviteeEmail(customer: { id: string; email: string | null; phone: string }) {
  if (customer.email) return customer.email;
  const digits = customer.phone.replace(/\D/g, "");
  return `booking+${customer.id.slice(0, 8)}+${digits || "phone"}@noemail.booking`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let toolCallId: string | null = null;

  try {
    const body = await req.json();
    const parsed = parseVapiToolCall(body);
    toolCallId = parsed.toolCallId;

    const { start_time } = parsed.args as { start_time?: string };
    const customer_id = resolveId(parsed.metadata, "customerId", parsed.args.customer_id);
    const agent_id = resolveId(parsed.metadata, "agentId", parsed.args.agent_id);
    let event_type_uri = parsed.args.event_type_uri as string | undefined;

    if (!customer_id || !agent_id) {
      return toolError(
        toolCallId,
        "no customer or agent on this call — bookings can only be made on a call placed from the portal"
      );
    }
    if (!start_time) {
      return toolError(toolCallId, "start_time is required");
    }

    const supabase = getSupabaseAdmin();

    const [{ data: customer, error: customerError }, { data: agent, error: agentError }] =
      await Promise.all([
        supabase.from("customers").select("*").eq("id", customer_id).single(),
        supabase.from("sales_agents").select("*").eq("id", agent_id).single(),
      ]);

    if (customerError || !customer) {
      return toolError(toolCallId, "customer not found", 404);
    }
    if (agentError || !agent) {
      return toolError(toolCallId, "agent not found", 404);
    }
    if (!agent.calendly_access_token || !agent.calendly_user_uri) {
      return toolError(toolCallId, "agent has no connected Calendly account");
    }

    let durationMinutes = MEETING_MINUTES;
    if (!event_type_uri) {
      const eventTypes = await listEventTypes(
        agent.calendly_access_token,
        agent.calendly_user_uri
      );
      event_type_uri = eventTypes[0]?.uri;
      if (eventTypes[0]?.duration) durationMinutes = eventTypes[0].duration;
    }
    if (!event_type_uri) {
      return toolError(toolCallId, "agent has no active Calendly event types");
    }

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("agent_id", agent_id)
      .neq("status", "canceled");

    if (
      slotConflictsWithAppointments(
        start_time,
        existingAppointments ?? [],
        durationMinutes,
        MEETING_MINUTES
      )
    ) {
      return toolResult(toolCallId, {
        error:
          "requested slot conflicts with an existing meeting or buffer — pick another time from check_agent_availability",
      });
    }

    const requestedStart = new Date(start_time);
    const windowEnd = new Date(requestedStart.getTime() + 24 * 60 * 60 * 1000);
    const availableTimes = await getAvailableTimes(
      agent.calendly_access_token,
      event_type_uri,
      requestedStart,
      windowEnd
    );
    const stillAvailable = availableTimes.some(
      (slot) => slot.start_time === requestedStart.toISOString()
    );
    if (!stillAvailable) {
      return toolResult(toolCallId, {
        error: "requested slot is no longer available",
        available_times: availableTimes.slice(0, 5),
      });
    }

    const invitee = await createEventInvitee(agent.calendly_access_token, {
      eventTypeUri: event_type_uri,
      startTime: requestedStart.toISOString(),
      invitee: {
        name: customer.name,
        email: calendlyInviteeEmail(customer),
        timezone: customer.timezone ?? agent.timezone ?? undefined,
      },
    });

    let zoomLink: string | null = null;
    try {
      const scheduledEvent = await getScheduledEvent(agent.calendly_access_token, invitee.event);
      zoomLink = scheduledEvent.location?.join_url ?? null;
    } catch (err) {
      console.warn("book-appointment: could not fetch scheduled event location", err);
    }

    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id,
        agent_id,
        scheduled_at: requestedStart.toISOString(),
        calendly_event_uri: invitee.event,
        cancel_url: invitee.cancel_url ?? null,
        reschedule_url: invitee.reschedule_url ?? null,
        zoom_link: zoomLink,
        duration_minutes: durationMinutes,
        source: "voice_agent",
        status: "confirmed",
      })
      .select()
      .single();

    if (insertError) {
      return toolError(toolCallId, insertError.message, 500);
    }

    await supabase
      .from("customers")
      .update({ status: "appointment_set" })
      .eq("id", customer_id);

    return toolResult(toolCallId, {
      appointment,
      booked: true,
      customer_name: customer.name,
      agent_name: agent.name,
      start_time: requestedStart.toISOString(),
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "internal error";
    if (message.includes("403") || message.toLowerCase().includes("scheduling")) {
      return toolError(
        toolCallId,
        "Calendly Scheduling API unavailable — agent needs a paid Calendly plan with Scheduling API enabled",
        502
      );
    }
    return toolError(toolCallId, message, 500);
  }
});

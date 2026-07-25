// Edge Function: book-appointment
//
// Called by the Vapi assistant once the customer has confirmed a specific
// time (usually the `best_match` returned by check-agent-availability).
//
// IMPORTANT — Calendly platform limitation: Calendly's public API has no
// endpoint to create a booking/invitee headlessly. The only server-side
// primitive is a single-use scheduling link (one link, good for exactly one
// booking) that still has to be opened to complete. So this function:
//   1. Re-confirms the slot is still free.
//   2. Creates a single-use scheduling link for the agent's event type,
//      pre-filled with the customer's name/email.
//   3. Writes an `appointments` row with status "scheduled" and
//      calendly_event_uri set to that link (a placeholder for the real
//      event, which doesn't exist until the invitee flow completes).
//   4. Emails both parties — the customer's email includes the one-click
//      link to lock in the time on the agent's actual calendar.
//
// For a fully headless "no click needed" booking you'd need to either move
// off Calendly (e.g. a provider with a real create-booking endpoint) or add
// a Calendly webhook subscription (`invitee.created`) that flips the
// appointment to "confirmed" and fills in the real event URI + Zoom link
// once the customer completes the link. That's a natural follow-up Edge
// Function (`calendly-webhook-handler`) but out of scope for this first cut.
//
// Request body (from Vapi tool-call):
//   {
//     "customer_id": "uuid",
//     "agent_id": "uuid",
//     "start_time": "2024-06-10T15:00:00.000Z",
//     "event_type_uri": "https://api.calendly.com/event_types/..."   // optional, re-derived if omitted
//   }

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import {
  buildPrefilledBookingUrl,
  createSingleUseSchedulingLink,
  getAvailableTimes,
  listEventTypes,
} from "../_shared/calendly.ts";
import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const args = body?.message?.toolCalls?.[0]?.function?.arguments ?? body;
    const { customer_id, agent_id, start_time } = args ?? {};
    let { event_type_uri } = args ?? {};

    if (!customer_id || !agent_id || !start_time) {
      return jsonResponse(
        { error: "customer_id, agent_id, and start_time are required" },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const [{ data: customer, error: customerError }, { data: agent, error: agentError }] =
      await Promise.all([
        supabase.from("customers").select("*").eq("id", customer_id).single(),
        supabase.from("sales_agents").select("*").eq("id", agent_id).single(),
      ]);

    if (customerError || !customer) {
      return jsonResponse({ error: "customer not found" }, 404);
    }
    if (agentError || !agent) {
      return jsonResponse({ error: "agent not found" }, 404);
    }
    if (!agent.calendly_access_token || !agent.calendly_user_uri) {
      return jsonResponse(
        { error: "agent has no connected Calendly account" },
        400
      );
    }

    if (!event_type_uri) {
      const eventTypes = await listEventTypes(
        agent.calendly_access_token,
        agent.calendly_user_uri
      );
      event_type_uri = eventTypes[0]?.uri;
    }
    if (!event_type_uri) {
      return jsonResponse(
        { error: "agent has no active Calendly event types" },
        400
      );
    }

    // Re-confirm the slot is still open right before booking.
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
      return jsonResponse(
        { error: "requested slot is no longer available", available_times: availableTimes.slice(0, 5) },
        409
      );
    }

    const { booking_url } = await createSingleUseSchedulingLink(
      agent.calendly_access_token,
      event_type_uri
    );
    const prefilledUrl = buildPrefilledBookingUrl(booking_url, {
      name: customer.name,
      email: customer.email ?? undefined,
    });

    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id,
        agent_id,
        scheduled_at: requestedStart.toISOString(),
        calendly_event_uri: prefilledUrl,
        status: "scheduled",
      })
      .select()
      .single();

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    await supabase
      .from("customers")
      .update({ status: "appointment_set" })
      .eq("id", customer_id);

    const formattedTime = requestedStart.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    await Promise.all([
      customer.email
        ? sendEmail({
            to: customer.email,
            subject: `Confirm your appointment with ${agent.name}`,
            html: `<p>Hi ${customer.name},</p><p>You asked to meet with ${agent.name} on <strong>${formattedTime}</strong>. Click below to lock it into their calendar:</p><p><a href="${prefilledUrl}">${prefilledUrl}</a></p>`,
          })
        : Promise.resolve(),
      sendEmail({
        to: agent.email,
        subject: `New appointment request: ${customer.name}`,
        html: `<p>Hi ${agent.name},</p><p>${customer.name} (${customer.phone}) requested <strong>${formattedTime}</strong> and was sent a link to confirm it on your calendar.</p>`,
      }),
    ]);

    return jsonResponse({ appointment, booking_url: prefilledUrl }, 201);
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

// Edge Function: book-appointment
//
// Called by the Vapi assistant once the customer confirms a specific time.
// Two modes, auto-detected per agent (same detection check-agent-availability
// uses): an agent with local weekly hours set (agent_availability_hours) is
// booked directly against this database — no external calendar involved, no
// event type, confirmed immediately. Everyone else books through Calendly's
// Scheduling API (POST /invitees), directly on the agent's calendar with the
// customer's name — no email link, no redirect — exactly as before.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import {
  createEventInvitee,
  getEventType,
  getScheduledEvent,
  listEventTypes,
} from "../_shared/calendly.ts";
import { findBookableSlot } from "../_shared/calendly-slots.ts";
import {
  buildQuestionsAndAnswers,
  buildVoiceBookingDescription,
} from "../_shared/calendly-booking-details.ts";
import {
  normalizeCanadaTimezone,
  resolveCustomerTimezone,
} from "../_shared/canada-timezones.ts";
import {
  BUFFER_MINUTES,
  agentMeetingMinutes,
  pickEventTypeForDuration,
  slotConflictsWithAppointments,
} from "../_shared/appointment-buffer.ts";
import {
  bookingWindowLimit,
  findLocalBookableSlot,
  getAgentAvailabilityHours,
  hasLocalAvailability,
} from "../_shared/local-availability.ts";
import { createZoomMeeting, refreshZoomAccessToken } from "../_shared/zoom.ts";
import { createGoogleMeetMeeting, refreshGoogleAccessToken } from "../_shared/google-meet.ts";
import { encryptToken } from "../_shared/token-crypto.ts";
import { sendTwilioSms } from "../_shared/twilio-sms.ts";
import { formatLocalTime } from "../_shared/local-time.ts";
import { resolveSmsLinkOverride, smsLinkSuffix } from "../_shared/sms-link.ts";
import { markActiveCallAppointmentSet } from "../_shared/call-insights.ts";
import { cancelAppointmentRow } from "../_shared/cancel-appointment-row.ts";

/**
 * Best-effort video link for a locally-booked appointment. Never blocks the
 * booking — same graceful-degradation philosophy as the Calendly join-link
 * fetch below: if the agent has no video provider connected, or the API
 * call fails for any reason, the appointment still books, just without a
 * link.
 */
async function createLocalVideoLink(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agent: {
    id: string;
    name: string;
    timezone: string;
    video_provider: string | null;
    zoom_access_token: string | null;
    zoom_refresh_token: string | null;
    zoom_token_expires_at: string | null;
    google_access_token: string | null;
    google_refresh_token: string | null;
    google_token_expires_at: string | null;
  },
  { startTimeIso, durationMinutes, summary, description }: {
    startTimeIso: string;
    durationMinutes: number;
    summary: string;
    description?: string;
    attendeeEmail?: string;
  }
): Promise<string | null> {
  if (agent.video_provider === "zoom" && agent.zoom_access_token) {
    try {
      let accessToken = (await decryptToken(agent.zoom_access_token))!;

      const expiresAt = agent.zoom_token_expires_at
        ? new Date(agent.zoom_token_expires_at).getTime()
        : 0;
      if (expiresAt < Date.now() + 5 * 60_000) {
        if (!agent.zoom_refresh_token) throw new Error("no zoom_refresh_token on file");
        const refreshToken = (await decryptToken(agent.zoom_refresh_token))!;
        const refreshed = await refreshZoomAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        await supabase
          .from("sales_agents")
          .update({
            zoom_access_token: await encryptToken(refreshed.access_token),
            zoom_refresh_token: await encryptToken(refreshed.refresh_token),
            zoom_token_expires_at: new Date(
              Date.now() + refreshed.expires_in * 1000
            ).toISOString(),
          })
          .eq("id", agent.id);
      }

      const meeting = await createZoomMeeting(accessToken, {
        summary,
        description,
        startTimeIso,
        durationMinutes,
        timezone: agent.timezone,
      });
      return meeting.joinUrl;
    } catch (err) {
      console.warn("book-appointment: could not create Zoom link", err);
      return null;
    }
  }

  if (agent.video_provider === "google_meet" && agent.google_access_token) {
    try {
      let accessToken = (await decryptToken(agent.google_access_token))!;

      const expiresAt = agent.google_token_expires_at
        ? new Date(agent.google_token_expires_at).getTime()
        : 0;
      if (expiresAt < Date.now() + 5 * 60_000) {
        if (!agent.google_refresh_token) throw new Error("no google_refresh_token on file");
        const refreshToken = (await decryptToken(agent.google_refresh_token))!;
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        await supabase
          .from("sales_agents")
          .update({
            google_access_token: await encryptToken(refreshed.access_token),
            google_token_expires_at: new Date(
              Date.now() + refreshed.expires_in * 1000
            ).toISOString(),
          })
          .eq("id", agent.id);
      }

      const meeting = await createGoogleMeetMeeting(accessToken);
      return meeting.joinUrl;
    } catch (err) {
      console.warn("book-appointment: could not create Google Meet link", err);
      return null;
    }
  }

  return null;
}

/** Calendly requires an email on the invitee record; we do not send mail ourselves. */
function calendlyInviteeEmail(customer: { id: string; email: string | null; phone: string }) {
  if (customer.email?.trim()) return customer.email.trim();
  const digits = customer.phone.replace(/\D/g, "");
  return `booking+${customer.id.slice(0, 8)}+${digits || "phone"}@example.com`;
}

/**
 * Best-effort confirmation texts — one to the customer, one to the agent's
 * own phone — sent from the agent's connected Twilio number. Same
 * graceful-degradation philosophy as createLocalVideoLink above: no
 * connected Twilio account, no connected number, or any send failure just
 * skips the text without blocking or failing the booking. The portal's
 * manual "Add appointment" sends the same pair — see lib/appointment-sms.ts.
 */
async function sendBookingConfirmationSms(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agent: {
    id: string;
    name: string;
    phone: string | null;
    timezone: string;
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
  },
  customer: { name: string; phone: string; timezone: string | null; province: string | null },
  { scheduledAtIso, zoomLink, smsLink }: {
    scheduledAtIso: string;
    zoomLink?: string | null;
    smsLink?: string | null;
  }
) {
  if (!agent.twilio_account_sid || !agent.twilio_auth_token) return;
  const accountSid = agent.twilio_account_sid;

  try {
    const { data: fromNumberRow } = await supabase
      .from("agent_phone_numbers")
      .select("phone_number")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!fromNumberRow?.phone_number) return;

    const authToken = await decryptToken(agent.twilio_auth_token);
    if (!authToken) return;

    const agentTimezone = normalizeCanadaTimezone(agent.timezone);
    const customerLocalTime = formatLocalTime(
      scheduledAtIso,
      resolveCustomerTimezone(customer.timezone, customer.province, agentTimezone)
    );
    // The agent always gets the real join link, in their own time zone —
    // smsLink (the recruitment careers link) is for the candidate only.
    const messages = [
      {
        to: customer.phone,
        body:
          `Your appointment with ${agent.name} is confirmed for ${customerLocalTime}.` +
          smsLinkSuffix(smsLink, zoomLink),
      },
      {
        to: agent.phone,
        body:
          `New appointment: ${customer.name} is booked with you for ${formatLocalTime(
            scheduledAtIso,
            agentTimezone
          )}.` + smsLinkSuffix(null, zoomLink),
      },
    ];

    // One recipient failing (bad number, carrier block) mustn't cost the other their text.
    for (const { to, body } of messages) {
      if (!to) continue;
      try {
        await sendTwilioSms({
          accountSid,
          authToken,
          from: fromNumberRow.phone_number,
          to,
          body,
        });
      } catch (err) {
        console.warn("book-appointment: could not send confirmation SMS", err);
      }
    }
  } catch (err) {
    console.warn("book-appointment: could not send confirmation SMS", err);
  }
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

    const { start_time, booking_notes } = parsed.args as {
      start_time?: string;
      booking_notes?: string;
    };
    const customer_id = resolveId(parsed.metadata, "customerId");
    const agent_id = resolveId(parsed.metadata, "agentId");
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

    const requestedStart = new Date(start_time);
    if (Number.isNaN(requestedStart.getTime())) {
      return toolError(toolCallId, "start_time must be a valid ISO 8601 timestamp");
    }

    // Same resolution order as lib/trigger-call.ts — metadata.script already
    // reflects a campaign window's override; the fallbacks only matter for
    // calls with no script in metadata.
    const smsLink = resolveSmsLinkOverride(
      resolveId(parsed.metadata, "script") ?? customer.call_type ?? agent.default_script
    );

    const localMode = await hasLocalAvailability(agent_id);

    if (!localMode && (!agent.calendly_access_token || !agent.calendly_user_uri)) {
      return toolError(
        toolCallId,
        "agent has no connected Calendly account and no local availability hours set — connect one in Settings or set hours on Calendar → Availability"
      );
    }

    // Safety net against duplicate/orphaned bookings: normally the assistant
    // calls cancel-appointment explicitly as soon as the customer rejects a
    // time already booked earlier in the same call (see vapi/agent.md), but
    // this guarantees it regardless — a customer should never end a call
    // with two active appointments, and a superseded one must not survive
    // as a stale "confirmed" row. Must run before the conflict check below
    // so a same-day correction doesn't get falsely blocked by the very
    // appointment it's replacing.
    const { data: priorAppointment } = await supabase
      .from("appointments")
      .select("id, agent_id, calendly_event_uri")
      .eq("customer_id", customer_id)
      .in("status", ["scheduled", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorAppointment) {
      await cancelAppointmentRow(
        priorAppointment,
        "Superseded by a new booking made later in the same call."
      );
    }

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("agent_id", agent_id)
      .neq("status", "canceled");

    // ---- Local mode: book directly against this database, no external calendar involved ----
    if (localMode) {
      const durationMinutes = agentMeetingMinutes(agent);

      if (
        slotConflictsWithAppointments(
          requestedStart.toISOString(),
          existingAppointments ?? [],
          durationMinutes,
          BUFFER_MINUTES
        )
      ) {
        return toolResult(toolCallId, {
          error:
            "requested slot conflicts with an existing meeting or buffer — pick another time from check_agent_availability",
        });
      }

      const hours = await getAgentAvailabilityHours(agent_id);
      const matchedSlot = findLocalBookableSlot(
        hours,
        normalizeCanadaTimezone(agent.timezone),
        start_time,
        durationMinutes
      );
      if (!matchedSlot) {
        return toolResult(toolCallId, {
          error:
            "requested slot is no longer available — call check_agent_availability again and use an exact start_time from the response",
        });
      }

      const bookedStartIso = matchedSlot.start_time;

      // The real guarantee behind the agent's rolling booking window —
      // check-agent-availability already never offers anything past it, but
      // a start_time the model came up with on its own still lands here.
      const bookingWindow = bookingWindowLimit(
        new Date(),
        agent.booking_window_days,
        normalizeCanadaTimezone(agent.timezone)
      );
      if (bookingWindow && new Date(bookedStartIso) >= bookingWindow.end) {
        return toolResult(toolCallId, {
          error:
            `requested slot is too far ahead — appointments are only being scheduled through ${bookingWindow.lastDay}. Offer an earlier time from check_agent_availability, or tell the customer you'll call them back closer to the day they want and do not book anything`,
        });
      }

      const bookingDescription = buildVoiceBookingDescription({
        customer,
        agent,
        scheduledAtIso: bookedStartIso,
        bookingNotes: booking_notes,
      });

      const zoomLink = await createLocalVideoLink(supabase, agent, {
        startTimeIso: bookedStartIso,
        durationMinutes,
        summary: `Appointment with ${customer.name}`,
        description: bookingDescription,
        attendeeEmail: customer.email?.trim() || undefined,
      });

      const { data: appointment, error: insertError } = await supabase
        .from("appointments")
        .insert({
          customer_id,
          agent_id,
          scheduled_at: bookedStartIso,
          zoom_link: zoomLink,
          sms_link: smsLink,
          duration_minutes: durationMinutes,
          source: "voice_agent",
          status: "confirmed",
          notes: bookingDescription,
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

      await markActiveCallAppointmentSet(
        customer_id,
        agent_id,
        bookedStartIso,
        agent.name,
        booking_notes
      );

      await sendBookingConfirmationSms(supabase, agent, customer, {
        scheduledAtIso: bookedStartIso,
        zoomLink,
        smsLink,
      });

      return toolResult(toolCallId, {
        appointment,
        booked: true,
        customer_name: customer.name,
        agent_name: agent.name,
        start_time: bookedStartIso,
        event_type_name: agent.name,
        zoom_link: zoomLink,
      });
    }

    // ---- Calendly mode: unchanged ----
    const calendlyAccessToken = (await decryptToken(agent.calendly_access_token))!;

    let durationMinutes = agentMeetingMinutes(agent);
    let eventTypeDetails = null;
    if (!event_type_uri) {
      const eventTypes = await listEventTypes(
        calendlyAccessToken,
        agent.calendly_user_uri
      );
      event_type_uri = pickEventTypeForDuration(eventTypes, durationMinutes)?.uri;
    }
    if (!event_type_uri) {
      return toolError(toolCallId, "agent has no active Calendly event types");
    }

    eventTypeDetails = await getEventType(calendlyAccessToken, event_type_uri);
    // Calendly decides the real length of the event being booked.
    if (eventTypeDetails.duration) durationMinutes = eventTypeDetails.duration;

    if (
      slotConflictsWithAppointments(
        requestedStart.toISOString(),
        existingAppointments ?? [],
        durationMinutes,
        BUFFER_MINUTES
      )
    ) {
      return toolResult(toolCallId, {
        error:
          "requested slot conflicts with an existing meeting or buffer — pick another time from check_agent_availability",
      });
    }

    const matchedSlot = await findBookableSlot(
      calendlyAccessToken,
      event_type_uri,
      start_time
    );
    if (!matchedSlot) {
      return toolResult(toolCallId, {
        error:
          "requested slot is no longer available — call check_agent_availability again and use an exact start_time from the response",
      });
    }

    const bookedStartIso = matchedSlot.start_time;
    const inviteeEmail = calendlyInviteeEmail(customer);
    const customerTimezone = resolveCustomerTimezone(
      customer.timezone,
      customer.province,
      normalizeCanadaTimezone(agent.timezone)
    );
    const bookingDescription = buildVoiceBookingDescription({
      customer,
      agent,
      scheduledAtIso: bookedStartIso,
      bookingNotes: booking_notes,
    });
    const questionsAndAnswers = buildQuestionsAndAnswers(eventTypeDetails.custom_questions, {
      customer,
      agent,
      description: bookingDescription,
      inviteeEmail,
    });

    const eventLocation = eventTypeDetails.locations?.[0];

    let invitee: Awaited<ReturnType<typeof createEventInvitee>> | undefined;
    try {
      invitee = await createEventInvitee(calendlyAccessToken, {
        eventTypeUri: event_type_uri,
        startTime: bookedStartIso,
        invitee: {
          name: customer.name,
          email: inviteeEmail,
          timezone: customerTimezone,
        },
        questionsAndAnswers,
        location: eventLocation,
      });
    } catch (bookingErr) {
      const calendlyMessage =
        bookingErr instanceof Error ? bookingErr.message : String(bookingErr);
      console.error("book-appointment: Calendly invitee failed", calendlyMessage);

      if (questionsAndAnswers.length > 0) {
        try {
          invitee = await createEventInvitee(calendlyAccessToken, {
            eventTypeUri: event_type_uri,
            startTime: bookedStartIso,
            invitee: {
              name: customer.name,
              email: inviteeEmail,
              timezone: customerTimezone,
            },
            location: eventLocation,
          });
        } catch (retryErr) {
          console.error("book-appointment: retry without questions failed", retryErr);
        }
      }

      if (!invitee) {
        const { data: portalAppointment, error: portalError } = await supabase
          .from("appointments")
          .insert({
            customer_id,
            agent_id,
            scheduled_at: bookedStartIso,
            duration_minutes: durationMinutes,
            source: "voice_agent",
            status: "scheduled",
            notes: `${bookingDescription}\n\n[Calendly auto-book failed: ${calendlyMessage.slice(0, 300)}]`,
          })
          .select()
          .single();

        if (portalError) {
          return toolError(toolCallId, calendlyMessage, 502);
        }

        const schedulingBlocked =
          calendlyMessage.includes("403") ||
          calendlyMessage.toLowerCase().includes("scheduling");

        return toolResult(toolCallId, {
          booked: false,
          portal_only: true,
          portal_appointment: portalAppointment,
          error: schedulingBlocked
            ? "Calendly Scheduling API unavailable — saved in portal only; upgrade Calendly or add the meeting manually"
            : "Could not create Calendly event — saved in portal only; pick another slot or add manually",
          start_time: bookedStartIso,
        });
      }
    }

    let zoomLink: string | null = null;
    try {
      const scheduledEvent = await getScheduledEvent(calendlyAccessToken, invitee.event);
      zoomLink = scheduledEvent.location?.join_url ?? null;
    } catch (err) {
      console.warn("book-appointment: could not fetch scheduled event location", err);
    }

    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id,
        agent_id,
        scheduled_at: bookedStartIso,
        calendly_event_uri: invitee.event,
        cancel_url: invitee.cancel_url ?? null,
        reschedule_url: invitee.reschedule_url ?? null,
        zoom_link: zoomLink,
        sms_link: smsLink,
        duration_minutes: durationMinutes,
        source: "voice_agent",
        status: "confirmed",
        notes: bookingDescription,
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

    await markActiveCallAppointmentSet(
      customer_id,
      agent_id,
      bookedStartIso,
      agent.name,
      booking_notes
    );

    await sendBookingConfirmationSms(supabase, agent, customer, {
      scheduledAtIso: bookedStartIso,
      zoomLink,
      smsLink,
    });

    return toolResult(toolCallId, {
      appointment,
      booked: true,
      customer_name: customer.name,
      agent_name: agent.name,
      start_time: bookedStartIso,
      event_type_name: eventTypeDetails.name,
      zoom_link: zoomLink,
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

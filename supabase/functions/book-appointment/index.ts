// Edge Function: book-appointment
//
// Called by the Vapi assistant once the customer confirms a specific time.
// Three modes, picked per agent the same way check-agent-availability picks
// them (sales_agents.calendar_provider, else the old inference): local
// weekly hours (agent_availability_hours) book directly against this
// database — no external calendar involved, no event type, confirmed
// immediately. Google Calendar mode books the same way, after re-checking
// the slot against the agent's live Google calendars, and also writes the
// event onto their Google Calendar (Google emails the customer the invite).
// Everyone else books through Calendly's Scheduling API (POST /invitees),
// directly on the agent's calendar with the customer's name — no email
// link, no redirect — exactly as before.
// The Resume script (RECRUITMENT) skips all of that: candidates pick one of
// the fixed daily sessions in recruitment-sessions.ts and are registered
// into it regardless of availability or other appointments.

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
} from "../_shared/local-availability.ts";
import {
  createGoogleCalendarEvent,
  findGoogleBookableSlot,
  getGoogleCalendarAccess,
  resolveCalendarMode,
} from "../_shared/google-calendar.ts";
import { createZoomMeeting, refreshZoomAccessToken } from "../_shared/zoom.ts";
import { createGoogleMeetMeeting, refreshGoogleAccessToken } from "../_shared/google-meet.ts";
import { encryptToken } from "../_shared/token-crypto.ts";
import { sendTwilioSms } from "../_shared/twilio-sms.ts";
import { formatLocalTime } from "../_shared/local-time.ts";
import {
  customerTextsSuppressed,
  resolveSmsLinkOverride,
  smsLinkSuffix,
} from "../_shared/sms-link.ts";
import { markActiveCallAppointmentSet } from "../_shared/call-insights.ts";
import { cancelAppointmentRow } from "../_shared/cancel-appointment-row.ts";
import { resolveRecruitmentSession } from "../_shared/recruitment-sessions.ts";
import { sendEmail } from "../_shared/email.ts";

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
        to: customerTextsSuppressed(smsLink) ? null : customer.phone,
        body:
          `Your appointment is set for ${customerLocalTime}.` +
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

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Resume script (RECRUITMENT) booking: registers the candidate into the
 * fixed session they picked (recruitment-sessions.ts). Deliberately no
 * availability hours, calendar free/busy, booking window, or conflict check —
 * every candidate who picks a session is booked into it. The candidate gets
 * no texts (sms_link marks the row — see customerTextsSuppressed); only the
 * agent is texted. The candidate's confirmation email is the Google Calendar invite when the agent has Google
 * connected, else a plain email.
 */
async function bookRecruitmentSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  toolCallId: string | null,
  {
    customer,
    agent,
    google,
    session,
    email,
    bookingNotes,
    smsLink,
  }: {
    // deno-lint-ignore no-explicit-any
    customer: any;
    // deno-lint-ignore no-explicit-any
    agent: any;
    google: Awaited<ReturnType<typeof getGoogleCalendarAccess>>;
    session: string;
    email?: string;
    bookingNotes?: string;
    smsLink: string | null;
  }
) {
  const agentTimezone = normalizeCanadaTimezone(agent.timezone);
  const customerTimezone = resolveCustomerTimezone(
    customer.timezone,
    customer.province,
    agentTimezone
  );
  const resolved = resolveRecruitmentSession(session, new Date(), customerTimezone);
  if ("error" in resolved) {
    return toolResult(toolCallId, { error: resolved.error });
  }

  const bookedStartIso = resolved.start_time;
  const durationMinutes = agentMeetingMinutes(agent);
  const attendeeEmail = email?.trim() || customer.email?.trim() || undefined;
  const bookingDescription = buildVoiceBookingDescription({
    customer,
    agent,
    scheduledAtIso: bookedStartIso,
    bookingNotes,
  });

  let googleEvent: { eventId: string; calendarId: string } | null = null;
  let googleCalendarWarning: string | null = null;
  if (google) {
    const calendarId = google.connection.booking_calendar_id;
    try {
      const created = await createGoogleCalendarEvent(google.accessToken, calendarId, {
        startTimeIso: bookedStartIso,
        durationMinutes,
        timeZone: agentTimezone,
        summary: `Recruitment consultation with ${customer.name}`,
        description: bookingDescription,
        attendeeEmail,
      });
      googleEvent = { eventId: created.eventId, calendarId };
    } catch (err) {
      console.error("book-appointment: Google Calendar event failed", err);
      googleCalendarWarning =
        "Booked in the portal, but the Google Calendar event couldn't be created — add it to Google Calendar by hand.";
    }
  }

  const { data: appointment, error: insertError } = await supabase
    .from("appointments")
    .insert({
      customer_id: customer.id,
      agent_id: agent.id,
      scheduled_at: bookedStartIso,
      zoom_link: null,
      google_event_id: googleEvent?.eventId ?? null,
      google_calendar_id: googleEvent?.calendarId ?? null,
      sms_link: smsLink,
      duration_minutes: durationMinutes,
      source: "voice_agent",
      status: "confirmed",
      notes: googleCalendarWarning
        ? `${bookingDescription}\n\n[${googleCalendarWarning}]`
        : bookingDescription,
    })
    .select()
    .single();

  if (insertError) {
    return toolError(toolCallId, insertError.message, 500);
  }

  await supabase
    .from("customers")
    .update({ status: "appointment_set" })
    .eq("id", customer.id);

  await markActiveCallAppointmentSet(
    customer.id,
    agent.id,
    bookedStartIso,
    agent.name,
    bookingNotes
  );

  // Google already emailed the invite when the event went on the calendar.
  if (!googleEvent && attendeeEmail) {
    await sendEmail({
      to: attendeeEmail,
      subject: "Your consultation is confirmed",
      html:
        `<p>Hi ${escapeHtml(customer.name)},</p>` +
        `<p>You're registered for the virtual consultation on ` +
        `<strong>${formatLocalTime(bookedStartIso, customerTimezone)}</strong>.</p>` +
        `<p>Thank you!</p>`,
    });
  }

  await sendBookingConfirmationSms(supabase, agent, customer, {
    scheduledAtIso: bookedStartIso,
    smsLink,
  });

  return toolResult(toolCallId, {
    appointment,
    booked: true,
    customer_name: customer.name,
    agent_name: agent.name,
    start_time: bookedStartIso,
    local_time: formatLocalTime(bookedStartIso, customerTimezone),
  });
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

    const { start_time, booking_notes, session, email } = parsed.args as {
      start_time?: string;
      booking_notes?: string;
      session?: string;
      email?: string;
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
    if (!start_time && !session) {
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

    // Same resolution order as lib/trigger-call.ts — metadata.script already
    // reflects a campaign window's override; the fallbacks only matter for
    // calls with no script in metadata.
    const script =
      resolveId(parsed.metadata, "script") ?? customer.call_type ?? agent.default_script;
    const recruitmentSession = script === "RECRUITMENT";
    const smsLink = resolveSmsLinkOverride(script);

    const requestedStart = new Date(start_time ?? "");
    if (!recruitmentSession && Number.isNaN(requestedStart.getTime())) {
      return toolError(toolCallId, "start_time must be a valid ISO 8601 timestamp");
    }

    const hours = await getAgentAvailabilityHours(agent_id);
    const mode = resolveCalendarMode(agent.calendar_provider, hours.length > 0);
    const localMode = mode === "crm";
    const googleMode = mode === "google";

    if (!recruitmentSession && localMode && hours.length === 0) {
      return toolError(
        toolCallId,
        "agent has no weekly hours set — set hours on Calendar → Availability or pick another booking calendar"
      );
    }
    if (
      !recruitmentSession &&
      mode === "calendly" &&
      (!agent.calendly_access_token || !agent.calendly_user_uri)
    ) {
      return toolError(
        toolCallId,
        "agent has no connected Calendly account and no local availability hours set — connect one in Settings or set hours on Calendar → Availability"
      );
    }
    const google = googleMode ? await getGoogleCalendarAccess(agent_id) : null;
    if (!recruitmentSession && googleMode && !google) {
      return toolError(
        toolCallId,
        "agent's Google Calendar isn't connected — reconnect it in Settings"
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
      .select("id, agent_id, calendly_event_uri, google_event_id, google_calendar_id")
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

    if (recruitmentSession) {
      return await bookRecruitmentSession(supabase, toolCallId, {
        customer,
        agent,
        google,
        session: session ?? start_time!,
        email,
        bookingNotes: booking_notes,
        smsLink,
      });
    }

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("agent_id", agent_id)
      .neq("status", "canceled");

    // ---- Local and Google modes: book against this database (and, in Google mode, onto the agent's Google Calendar) ----
    if (localMode || google) {
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

      // Google mode re-reads the agent's live calendars here — a meeting
      // they added since check_agent_availability must still block the slot.
      const matchedSlot = google
        ? await findGoogleBookableSlot(
            {
              accessToken: google.accessToken,
              connection: google.connection,
              hours,
              agentTimezone: normalizeCanadaTimezone(agent.timezone),
              meetingMinutes: durationMinutes,
            },
            start_time
          )
        : findLocalBookableSlot(
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

      const videoLinkInput = {
        startTimeIso: bookedStartIso,
        durationMinutes,
        summary: `Appointment with ${customer.name}`,
        description: bookingDescription,
        attendeeEmail: customer.email?.trim() || undefined,
      };

      let zoomLink: string | null = null;
      let googleEvent: { eventId: string; calendarId: string } | null = null;
      let googleCalendarWarning: string | null = null;

      if (google) {
        // Zoom agents keep their Zoom link (put on the event); everyone else
        // gets the Meet link Google attaches to the event itself, so no
        // separate Google Meet connection is needed in this mode.
        const presetLink =
          agent.video_provider === "zoom"
            ? await createLocalVideoLink(supabase, agent, videoLinkInput)
            : null;
        const calendarId = google.connection.booking_calendar_id;
        try {
          const created = await createGoogleCalendarEvent(google.accessToken, calendarId, {
            ...videoLinkInput,
            timeZone: normalizeCanadaTimezone(agent.timezone),
            videoLink: presetLink,
          });
          googleEvent = { eventId: created.eventId, calendarId };
          zoomLink = created.meetingLink;
        } catch (err) {
          // The slot was verified free and the customer is about to hear it's
          // booked — keep the booking in the portal and flag the miss.
          console.error("book-appointment: Google Calendar event failed", err);
          googleCalendarWarning =
            "Booked in the portal, but the Google Calendar event couldn't be created — add it to Google Calendar by hand.";
          zoomLink = presetLink ?? (await createLocalVideoLink(supabase, agent, videoLinkInput));
        }
      } else {
        zoomLink = await createLocalVideoLink(supabase, agent, videoLinkInput);
      }

      const { data: appointment, error: insertError } = await supabase
        .from("appointments")
        .insert({
          customer_id,
          agent_id,
          scheduled_at: bookedStartIso,
          zoom_link: zoomLink,
          google_event_id: googleEvent?.eventId ?? null,
          google_calendar_id: googleEvent?.calendarId ?? null,
          sms_link: smsLink,
          duration_minutes: durationMinutes,
          source: "voice_agent",
          status: "confirmed",
          notes: googleCalendarWarning
            ? `${bookingDescription}\n\n[${googleCalendarWarning}]`
            : bookingDescription,
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

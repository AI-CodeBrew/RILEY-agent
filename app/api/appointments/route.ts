import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, authorizeRow, requireApiSession } from "@/lib/auth";
import { sendManualAppointmentConfirmationSms } from "@/lib/appointment-sms";
import { createAgentVideoLink } from "@/lib/appointment-video-link";
import { createGoogleCalendarEvent, getGoogleCalendarAccess } from "@/lib/google-calendar";
import type { Customer } from "@/types/database";

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;

  const query = applyAgentScope(
    supabaseAdmin
      .from("appointments")
      .select(
        "*, customer:customers(id, name, phone, email), agent:sales_agents(id, name, email)"
      )
      .order("scheduled_at", { ascending: false }),
    auth.session,
    { requestedAgentId: params.get("agent") ?? undefined }
  );

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data });
}

/**
 * Books an appointment by hand — the escape hatch for when an agent sets a
 * meeting themselves (call-back, inbound, email) and wants it on the same
 * board as the ones Riley books. Source is tagged `manual` so it's clear
 * which side of the funnel it came from.
 */
export async function POST(request: Request) {
  // An appointment is booked on somebody's calendar — the agent's. Admins can
  // see every appointment but don't create them.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { customer_id, scheduled_at, duration_minutes, zoom_link, notes } =
    body ?? {};

  if (!customer_id || !scheduled_at) {
    return NextResponse.json(
      { error: "customer_id and scheduled_at are required" },
      { status: 400 }
    );
  }

  const scheduledDate = new Date(scheduled_at);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "scheduled_at isn't a valid date" }, { status: 400 });
  }

  const authorized = await authorizeRow<Customer>(
    "customers",
    customer_id,
    auth.session
  );
  if ("error" in authorized) return authorized.error;

  const { agent } = auth.session;
  const ownerId = agent.id;
  const durationMinutes = duration_minutes ? Number(duration_minutes) : 30;
  const pastedLink = typeof zoom_link === "string" ? zoom_link.trim() : "";
  const videoLinkInput = {
    startTimeIso: scheduledDate.toISOString(),
    durationMinutes,
    summary: `Appointment with ${authorized.row.name}`,
    description: typeof notes === "string" && notes ? notes : undefined,
  };

  // Google Calendar agents get the appointment on their Google Calendar too,
  // same as a booking Riley makes. Best-effort: a Google failure still saves
  // the appointment here, with a warning.
  let meetingLink: string | null = null;
  let googleEvent: { eventId: string; calendarId: string } | null = null;
  let googleWarning: string | null = null;
  const google =
    agent.calendar_provider === "google" ? await getGoogleCalendarAccess(ownerId).catch(() => null) : null;

  if (google) {
    // A pasted link or a Zoom link goes on the event; otherwise Google
    // attaches a Meet link of its own.
    const presetLink =
      pastedLink ||
      (agent.video_provider === "zoom" ? await createAgentVideoLink(ownerId, videoLinkInput) : null);
    try {
      const calendarId = google.connection.booking_calendar_id;
      const created = await createGoogleCalendarEvent(google.accessToken, calendarId, {
        ...videoLinkInput,
        timeZone: agent.timezone,
        attendeeEmail: authorized.row.email?.trim() || undefined,
        videoLink: presetLink,
      });
      googleEvent = { eventId: created.eventId, calendarId };
      meetingLink = created.meetingLink;
    } catch (err) {
      console.error("appointments: Google Calendar event failed", err);
      googleWarning = "Saved here, but Google Calendar rejected the event — add it to Google Calendar yourself.";
      meetingLink = presetLink;
    }
  } else {
    // A link the agent pasted wins; otherwise one is created from their
    // connected Zoom/Google Meet account, same as a booking Riley makes.
    meetingLink = pastedLink || (await createAgentVideoLink(ownerId, videoLinkInput));
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      customer_id,
      agent_id: ownerId,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: durationMinutes,
      zoom_link: meetingLink || null,
      google_event_id: googleEvent?.eventId ?? null,
      google_calendar_id: googleEvent?.calendarId ?? null,
      notes: notes || null,
      source: "manual",
      status: "confirmed",
    })
    .select(
      "*, customer:customers(id, name, phone, email), agent:sales_agents(id, name, email)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("customers")
    .update({ status: "appointment_set" })
    .eq("id", customer_id);

  await sendManualAppointmentConfirmationSms({
    agentId: ownerId,
    customer: authorized.row,
    scheduledAtIso: scheduledDate.toISOString(),
    zoomLink: meetingLink || null,
  });

  return NextResponse.json({ appointment: data, warning: googleWarning }, { status: 201 });
}

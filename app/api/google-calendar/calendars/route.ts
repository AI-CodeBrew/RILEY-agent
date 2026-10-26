import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import {
  createAvailabilityCalendar,
  getGoogleCalendarAccess,
  listGoogleCalendars,
} from "@/lib/google-calendar";

/** The agent's Google calendars, for the availability/conflict pickers in Settings. */
export async function GET() {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  try {
    const access = await getGoogleCalendarAccess(auth.session.agent.id);
    if (!access) {
      return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 400 });
    }
    return NextResponse.json({ calendars: await listGoogleCalendars(access.accessToken) });
  } catch (err) {
    console.error("google calendar list failed:", err);
    return NextResponse.json(
      { error: "Could not load your Google calendars — try reconnecting Google Calendar." },
      { status: 502 }
    );
  }
}

/** Creates a "Riley Availability" calendar in the agent's Google account and makes it their availability calendar. */
export async function POST() {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;
  const { agent } = auth.session;

  try {
    const access = await getGoogleCalendarAccess(agent.id);
    if (!access) {
      return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 400 });
    }

    const calendar = await createAvailabilityCalendar(access.accessToken, agent.timezone);
    const { error } = await supabaseAdmin
      .from("google_calendar_connections")
      .update({
        availability_calendar_id: calendar.id,
        availability_calendar_name: calendar.name,
        busy_calendar_ids: access.connection.busy_calendar_ids.filter((id) => id !== calendar.id),
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agent.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ calendar });
  } catch (err) {
    console.error("google calendar create failed:", err);
    return NextResponse.json(
      { error: "Could not create the calendar in Google — try reconnecting Google Calendar." },
      { status: 502 }
    );
  }
}

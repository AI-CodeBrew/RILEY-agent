import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { getGoogleCalendarAccess, listGoogleCalendars } from "@/lib/google-calendar";

/**
 * Saves which Google calendar marks the agent's free time and which ones
 * count as busy. Ids are checked against the agent's real calendar list so
 * a stale or hand-crafted id can't silently break availability on a call.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const availabilityId: unknown = body?.availability_calendar_id;
  const busyIds: unknown = body?.busy_calendar_ids;

  if (availabilityId !== null && typeof availabilityId !== "string") {
    return NextResponse.json({ error: "availability_calendar_id must be a string or null" }, { status: 400 });
  }
  if (!Array.isArray(busyIds) || busyIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "busy_calendar_ids must be an array of strings" }, { status: 400 });
  }
  if (availabilityId && busyIds.includes(availabilityId)) {
    return NextResponse.json(
      { error: "Your availability calendar can't also be a conflict calendar — its blocks would hide themselves." },
      { status: 400 }
    );
  }

  try {
    const access = await getGoogleCalendarAccess(auth.session.agent.id);
    if (!access) {
      return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 400 });
    }

    const calendars = await listGoogleCalendars(access.accessToken);
    const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
    // "primary" is Google's alias for the account's main calendar.
    const known = (id: string) => id === "primary" || byId.has(id);

    if (availabilityId && !known(availabilityId)) {
      return NextResponse.json({ error: "That availability calendar wasn't found in your Google account." }, { status: 400 });
    }
    if (!(busyIds as string[]).every(known)) {
      return NextResponse.json({ error: "One of the conflict calendars wasn't found in your Google account." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("google_calendar_connections")
      .update({
        availability_calendar_id: availabilityId || null,
        availability_calendar_name: availabilityId ? byId.get(availabilityId)?.name ?? null : null,
        busy_calendar_ids: Array.from(new Set(busyIds as string[])),
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", auth.session.agent.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("google calendar settings failed:", err);
    return NextResponse.json(
      { error: "Could not reach Google Calendar — try reconnecting it." },
      { status: 502 }
    );
  }
}

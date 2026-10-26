import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import type { CalendarProvider } from "@/types/database";

const PROVIDERS: CalendarProvider[] = ["crm", "calendly", "google"];

/**
 * Picks which calendar Riley reads availability from and books into. Each
 * choice has to be usable before it can be picked — otherwise every call
 * would hit "no availability" until the agent noticed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json({ error: "you can only change your own booking calendar" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const provider = body?.calendar_provider as CalendarProvider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `unknown calendar "${body?.calendar_provider}"` }, { status: 400 });
  }

  const [{ count: hoursCount }, { data: connection }] = await Promise.all([
    supabaseAdmin
      .from("agent_availability_hours")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", id),
    supabaseAdmin
      .from("google_calendar_connections")
      .select("availability_calendar_id")
      .eq("agent_id", id)
      .maybeSingle(),
  ]);
  const hasHours = (hoursCount ?? 0) > 0;

  if (provider === "calendly" && !auth.session.agent.calendly_user_uri) {
    return NextResponse.json({ error: "Connect Calendly in Settings first." }, { status: 400 });
  }
  if (provider === "crm" && !hasHours) {
    return NextResponse.json(
      { error: "Set your weekly hours on Calendar → Availability first." },
      { status: 400 }
    );
  }
  if (provider === "google") {
    if (!connection) {
      return NextResponse.json({ error: "Connect Google Calendar first." }, { status: 400 });
    }
    if (!connection.availability_calendar_id && !hasHours) {
      return NextResponse.json(
        { error: "Pick your availability calendar first (or set weekly hours on Calendar → Availability)." },
        { status: 400 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("sales_agents")
    .update({ calendar_provider: provider })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

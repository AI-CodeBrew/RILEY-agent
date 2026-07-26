import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeRow, requireApiSession } from "@/lib/auth";
import { cancelCalendlyEvent, isCalendlyEventUri } from "@/lib/calendly";
import type { Appointment, AppointmentStatus } from "@/types/database";

const ALLOWED_STATUSES: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "canceled",
  "no_show",
];

/**
 * Status changes and notes from the portal. Canceling here also cancels the
 * real Calendly event (when there is one), so the agent's calendar frees up
 * and the customer gets Calendly's cancellation notice — otherwise the two
 * views drift apart, which is the whole reason this tab exists.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Canceling here cancels a real event on an agent's calendar, so it stays
  // with the agent — admins have read-only visibility over appointments.
  const auth = await requireApiSession({ agentOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Appointment>(
    "appointments",
    id,
    auth.session
  );
  if ("error" in authorized) return authorized.error;
  const appointment = authorized.row;

  const body = await request.json().catch(() => ({}));
  const updates: Partial<Appointment> = {};
  let calendlyWarning: string | null = null;

  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.zoom_link !== undefined) updates.zoom_link = body.zoom_link || null;

  if (body.scheduled_at !== undefined) {
    const date = new Date(body.scheduled_at);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "scheduled_at isn't a valid date" }, { status: 400 });
    }
    updates.scheduled_at = date.toISOString();
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `unknown status "${body.status}"` }, { status: 400 });
    }
    updates.status = body.status;

    if (body.status === "canceled") {
      updates.canceled_at = new Date().toISOString();
      updates.canceled_reason = body.canceled_reason || null;

      if (isCalendlyEventUri(appointment.calendly_event_uri)) {
        const { data: agent } = await supabaseAdmin
          .from("sales_agents")
          .select("calendly_access_token")
          .eq("id", appointment.agent_id ?? "")
          .maybeSingle();

        if (agent?.calendly_access_token) {
          try {
            await cancelCalendlyEvent(
              agent.calendly_access_token,
              appointment.calendly_event_uri!,
              body.canceled_reason
            );
          } catch (err) {
            // Still cancel on our side — a stale Calendly event is better
            // than a portal that says "confirmed" for a dead meeting.
            console.error(`Calendly cancellation failed for appointment ${id}:`, err);
            calendlyWarning =
              "Canceled here, but Calendly rejected the cancellation — cancel it from Calendly too.";
          }
        }
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update(updates)
    .eq("id", id)
    .select(
      "*, customer:customers(id, name, phone, email), agent:sales_agents(id, name, email)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointment: data, warning: calendlyWarning });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeRow<Appointment>(
    "appointments",
    id,
    auth.session
  );
  if ("error" in authorized) return authorized.error;

  const { error } = await supabaseAdmin.from("appointments").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

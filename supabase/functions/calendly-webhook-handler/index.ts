// Edge Function: calendly-webhook-handler
//
// Keeps appointments in sync when Calendly events change. book-appointment
// now books directly via the Scheduling API (POST /invitees); this handler
// mainly handles invitee.canceled / reschedule updates and can backfill
// zoom links if they were missing at booking time.
//
// Subscription is scoped to a single Calendly user, so we identify which
// agent a payload belongs to via the event's host membership, then verify
// the request against that agent's stored per-subscription signing key.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyCalendlySignature } from "../_shared/calendly-webhook-auth.ts";

interface CalendlyLocation {
  type?: string;
  join_url?: string;
}

interface CalendlyScheduledEvent {
  uri: string;
  start_time: string;
  location?: CalendlyLocation;
  event_memberships?: { user: string }[];
}

interface CalendlyWebhookPayload {
  event: "invitee.created" | "invitee.canceled";
  payload: {
    email?: string;
    /** Invitee-scoped links Calendly generates — surfaced in the portal so an
     * agent can cancel or reschedule without logging into Calendly. */
    cancel_url?: string;
    reschedule_url?: string;
    scheduled_event?: CalendlyScheduledEvent;
  };
}

const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000; // ±2h around the reported start time

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody) as CalendlyWebhookPayload;

    const scheduledEvent = body.payload?.scheduled_event;
    const hostUserUri = scheduledEvent?.event_memberships?.[0]?.user;

    if (!hostUserUri) {
      console.warn("calendly-webhook-handler: payload missing host user uri, ignoring");
      return jsonResponse({ received: true });
    }

    const supabase = getSupabaseAdmin();
    const { data: agent } = await supabase
      .from("sales_agents")
      .select("id, calendly_webhook_signing_key")
      .eq("calendly_user_uri", hostUserUri)
      .single();

    if (!agent?.calendly_webhook_signing_key) {
      console.warn(`calendly-webhook-handler: no agent/signing key for ${hostUserUri}`);
      return jsonResponse({ received: true });
    }

    const validSignature = await verifyCalendlySignature(
      rawBody,
      req.headers.get("Calendly-Webhook-Signature"),
      agent.calendly_webhook_signing_key
    );
    if (!validSignature) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    if (!scheduledEvent) {
      return jsonResponse({ received: true });
    }

    if (body.event === "invitee.created") {
      const joinUrl = scheduledEvent.location?.join_url ?? null;
      const startTime = new Date(scheduledEvent.start_time);

      const { data: byEventUri } = await supabase
        .from("appointments")
        .select("id, zoom_link")
        .eq("calendly_event_uri", scheduledEvent.uri)
        .maybeSingle();

      if (byEventUri) {
        await supabase
          .from("appointments")
          .update({
            status: "confirmed",
            zoom_link: joinUrl ?? byEventUri.zoom_link,
            cancel_url: body.payload.cancel_url ?? null,
            reschedule_url: body.payload.reschedule_url ?? null,
            scheduled_at: startTime.toISOString(),
          })
          .eq("id", byEventUri.id);
        return jsonResponse({ received: true });
      }

      const { data: candidates } = await supabase
        .from("appointments")
        .select("id, scheduled_at, customer:customers(email)")
        .eq("agent_id", agent.id)
        .in("status", ["scheduled", "confirmed"])
        .gte("scheduled_at", new Date(startTime.getTime() - MATCH_WINDOW_MS).toISOString())
        .lte("scheduled_at", new Date(startTime.getTime() + MATCH_WINDOW_MS).toISOString());

      const match = pickClosestAppointment(candidates ?? [], startTime, body.payload.email);

      if (match) {
        await supabase
          .from("appointments")
          .update({
            status: "confirmed",
            calendly_event_uri: scheduledEvent.uri,
            zoom_link: joinUrl,
            cancel_url: body.payload.cancel_url ?? null,
            reschedule_url: body.payload.reschedule_url ?? null,
            // The customer may have picked a different slot than the one
            // Riley proposed — trust the event, not our placeholder.
            scheduled_at: startTime.toISOString(),
          })
          .eq("id", match.id);
      } else {
        console.warn(
          `calendly-webhook-handler: no matching scheduled appointment for agent ${agent.id} near ${scheduledEvent.start_time}`
        );
      }
    }

    if (body.event === "invitee.canceled") {
      const { data: byEventUri } = await supabase
        .from("appointments")
        .select("id")
        .eq("calendly_event_uri", scheduledEvent.uri)
        .maybeSingle();

      if (byEventUri) {
        await supabase
          .from("appointments")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("id", byEventUri.id);
      } else {
        // Customer canceled before invitee.created ever landed here (or it
        // was missed) — fall back to time+agent matching against anything
        // still open.
        const startTime = new Date(scheduledEvent.start_time);
        const { data: candidates } = await supabase
          .from("appointments")
          .select("id, scheduled_at, customer:customers(email)")
          .eq("agent_id", agent.id)
          .in("status", ["scheduled", "confirmed"])
          .gte("scheduled_at", new Date(startTime.getTime() - MATCH_WINDOW_MS).toISOString())
          .lte("scheduled_at", new Date(startTime.getTime() + MATCH_WINDOW_MS).toISOString());

        const match = pickClosestAppointment(candidates ?? [], startTime, body.payload.email);
        if (match) {
          await supabase
            .from("appointments")
            .update({ status: "canceled", canceled_at: new Date().toISOString() })
            .eq("id", match.id);
        }
      }
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

function pickClosestAppointment(
  candidates: { id: string; scheduled_at: string; customer: { email: string | null } | null }[],
  targetTime: Date,
  invieeEmail: string | undefined
) {
  const emailMatches = invieeEmail
    ? candidates.filter((c) => c.customer?.email === invieeEmail)
    : [];
  const pool = emailMatches.length > 0 ? emailMatches : candidates;

  return pool.reduce<typeof pool[number] | null>((closest, candidate) => {
    if (!closest) return candidate;
    const closestDiff = Math.abs(new Date(closest.scheduled_at).getTime() - targetTime.getTime());
    const candidateDiff = Math.abs(
      new Date(candidate.scheduled_at).getTime() - targetTime.getTime()
    );
    return candidateDiff < closestDiff ? candidate : closest;
  }, null);
}

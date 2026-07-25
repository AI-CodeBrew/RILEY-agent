// Edge Function: check-agent-availability
//
// Called by the Vapi assistant (as a function/tool) while it's on the phone
// with a customer, once the customer has given a rough idea of when they
// want to meet. Looks up the assigned sales agent's Calendly availability
// and returns the closest matching open slot(s) so the assistant can read
// them back and confirm before calling book-appointment.
//
// Request body (from Vapi tool-call):
//   {
//     "agent_id": "uuid",
//     "requested_time": "2024-06-10T15:00:00.000Z",   // optional ISO 8601
//     "search_days": 7                                 // optional, default 7
//   }
//
// Response:
//   {
//     "event_type_uri": "https://api.calendly.com/event_types/...",
//     "best_match": { "start_time": "..." } | null,
//     "available_times": [{ "start_time": "..." }, ...]   // up to 10
//   }

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { getAvailableTimes, listEventTypes } from "../_shared/calendly.ts";

const CALENDLY_MAX_WINDOW_DAYS = 7;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    // Vapi wraps tool-call arguments under message.toolCalls[].function.arguments
    // when hit via the assistant's default tool-call format; support both a
    // raw body and that envelope so this works from Vapi or curl.
    const args = body?.message?.toolCalls?.[0]?.function?.arguments ?? body;

    const { agent_id, requested_time, search_days } = args ?? {};

    if (!agent_id) {
      return jsonResponse({ error: "agent_id is required" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: agent, error: agentError } = await supabase
      .from("sales_agents")
      .select("id, calendly_access_token, calendly_user_uri")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return jsonResponse({ error: "agent not found" }, 404);
    }
    if (!agent.calendly_access_token || !agent.calendly_user_uri) {
      return jsonResponse(
        { error: "agent has no connected Calendly account" },
        400
      );
    }

    const eventTypes = await listEventTypes(
      agent.calendly_access_token,
      agent.calendly_user_uri
    );
    const eventType = eventTypes[0];
    if (!eventType) {
      return jsonResponse(
        { error: "agent has no active Calendly event types" },
        400
      );
    }

    const windowDays = Math.min(
      search_days ?? CALENDLY_MAX_WINDOW_DAYS,
      CALENDLY_MAX_WINDOW_DAYS
    );
    const start = new Date();
    const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const availableTimes = await getAvailableTimes(
      agent.calendly_access_token,
      eventType.uri,
      start,
      end
    );

    let bestMatch = null;
    if (requested_time) {
      const requestedMs = new Date(requested_time).getTime();
      bestMatch = availableTimes.reduce((closest, slot) => {
        const slotMs = new Date(slot.start_time).getTime();
        if (slotMs < Date.now()) return closest;
        if (!closest) return slot;
        const closestDiff = Math.abs(new Date(closest.start_time).getTime() - requestedMs);
        const slotDiff = Math.abs(slotMs - requestedMs);
        return slotDiff < closestDiff ? slot : closest;
      }, null as (typeof availableTimes)[number] | null);
    }

    return jsonResponse({
      event_type_uri: eventType.uri,
      event_type_name: eventType.name,
      best_match: bestMatch ? { start_time: bestMatch.start_time } : null,
      available_times: availableTimes.slice(0, 10).map((slot) => ({
        start_time: slot.start_time,
      })),
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

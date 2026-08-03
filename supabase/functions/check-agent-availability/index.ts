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
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { getAvailableTimes, listEventTypes } from "../_shared/calendly.ts";
import {
  BUFFER_MINUTES,
  MEETING_MINUTES,
  filterSlotsWithBuffer,
} from "../_shared/appointment-buffer.ts";

const CALENDLY_MAX_WINDOW_DAYS = 7;

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

    const { requested_time, search_days } = parsed.args as {
      requested_time?: string;
      search_days?: number;
    };
    const agent_id = resolveId(parsed.metadata, "agentId", parsed.args.agent_id);

    if (!agent_id) {
      return toolError(
        toolCallId,
        "no agent on this call — availability can only be checked on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agent, error: agentError } = await supabase
      .from("sales_agents")
      .select("id, calendly_access_token, calendly_user_uri")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return toolError(toolCallId, "agent not found", 404);
    }
    if (!agent.calendly_access_token || !agent.calendly_user_uri) {
      return toolError(
        toolCallId,
        "agent has no connected Calendly account"
      );
    }

    const eventTypes = await listEventTypes(
      agent.calendly_access_token,
      agent.calendly_user_uri
    );
    const eventType = eventTypes[0];
    if (!eventType) {
      return toolError(
        toolCallId,
        "agent has no active Calendly event types"
      );
    }

    const windowDays = Math.min(
      search_days ?? CALENDLY_MAX_WINDOW_DAYS,
      CALENDLY_MAX_WINDOW_DAYS
    );
    // Calendly rejects a start_time that isn't strictly in the future, and by
    // the time the request lands "now" already isn't — it 400s with
    // "start_time must be in the future". Nudge the window forward so the
    // call survives the round trip.
    const start = new Date(Date.now() + 60_000);
    const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const availableTimes = await getAvailableTimes(
      agent.calendly_access_token,
      eventType.uri,
      start,
      end
    );

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("agent_id", agent_id)
      .neq("status", "canceled");

    const bufferedTimes = filterSlotsWithBuffer(
      availableTimes,
      existingAppointments ?? [],
      MEETING_MINUTES,
      BUFFER_MINUTES
    );

    let bestMatch = null;
    if (requested_time) {
      const requestedMs = new Date(requested_time).getTime();
      bestMatch = bufferedTimes.reduce((closest, slot) => {
        const slotMs = new Date(slot.start_time).getTime();
        if (slotMs < Date.now()) return closest;
        if (!closest) return slot;
        const closestDiff = Math.abs(new Date(closest.start_time).getTime() - requestedMs);
        const slotDiff = Math.abs(slotMs - requestedMs);
        return slotDiff < closestDiff ? slot : closest;
      }, null as (typeof bufferedTimes)[number] | null);
    }

    return toolResult(toolCallId, {
      event_type_uri: eventType.uri,
      event_type_name: eventType.name,
      meeting_duration_minutes: MEETING_MINUTES,
      buffer_minutes: BUFFER_MINUTES,
      best_match: bestMatch ? { start_time: bestMatch.start_time } : null,
      available_times: bufferedTimes.slice(0, 10).map((slot) => ({
        start_time: slot.start_time,
      })),
    });
  } catch (err) {
    console.error(err);
    return toolError(
      toolCallId,
      err instanceof Error ? err.message : "internal error",
      500
    );
  }
});

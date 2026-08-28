// Edge Function: check-agent-availability
//
// Called by the Vapi assistant (as a function/tool) while it's on the phone
// with a customer, once the customer has given a rough idea of when they
// want to meet. Looks up the assigned sales agent's availability — either
// their connected Calendly account, or (if they've set weekly hours on the
// portal's Calendar → Availability page) local hours computed entirely from
// this database — and returns the closest matching open slot(s) so the
// assistant can read them back and confirm before calling book-appointment.
// Mode is auto-detected per agent, not a manual toggle: an agent with any
// agent_availability_hours rows uses local availability; otherwise this
// falls back to the Calendly path, unchanged.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { getAvailableTimes, listEventTypes } from "../_shared/calendly.ts";
import {
  canadaTimezoneLabel,
  formatShortTimeInTimezone,
  formatSlotInTimezone,
  normalizeCanadaTimezone,
} from "../_shared/canada-timezones.ts";
import {
  BUFFER_MINUTES,
  MEETING_MINUTES,
  filterSlotsWithBuffer,
} from "../_shared/appointment-buffer.ts";
import {
  generateCandidateSlots,
  getAgentAvailabilityHours,
  hasLocalAvailability,
} from "../_shared/local-availability.ts";

const CALENDLY_MAX_WINDOW_DAYS = 7;

function formatSlotForCustomer(isoUtc: string, customerTimezone: string) {
  const label = canadaTimezoneLabel(customerTimezone);
  return {
    start_time: isoUtc,
    local_time: formatSlotInTimezone(isoUtc, customerTimezone),
    local_time_short: formatShortTimeInTimezone(isoUtc, customerTimezone),
    timezone_label: label,
  };
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

    const { requested_time, search_days } = parsed.args as {
      requested_time?: string;
      search_days?: number;
    };
    const agent_id = resolveId(parsed.metadata, "agentId");
    const customer_id = resolveId(parsed.metadata, "customerId");

    if (!agent_id) {
      return toolError(
        toolCallId,
        "no agent on this call — availability can only be checked on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();

    let customerTimezone = normalizeCanadaTimezone(null);
    if (customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("timezone")
        .eq("id", customer_id)
        .maybeSingle();
      customerTimezone = normalizeCanadaTimezone(customer?.timezone);
    }

    const { data: agent, error: agentError } = await supabase
      .from("sales_agents")
      .select("id, name, timezone, calendly_access_token, calendly_user_uri")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return toolError(toolCallId, "agent not found", 404);
    }

    const localMode = await hasLocalAvailability(agent_id);

    if (!localMode && (!agent.calendly_access_token || !agent.calendly_user_uri)) {
      return toolError(
        toolCallId,
        "agent has no connected Calendly account and no local availability hours set — connect one in Settings or set hours on Calendar → Availability"
      );
    }

    const windowDays = Math.min(
      search_days ?? CALENDLY_MAX_WINDOW_DAYS,
      CALENDLY_MAX_WINDOW_DAYS
    );
    const start = new Date(Date.now() + 60_000);
    const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);

    let eventTypeUri: string | null = null;
    let eventTypeName = agent.name;
    let rawSlots: { start_time: string }[];

    if (localMode) {
      const hours = await getAgentAvailabilityHours(agent_id);
      rawSlots = generateCandidateSlots({
        hours,
        windowStart: start,
        windowEnd: end,
        agentTimezone: normalizeCanadaTimezone(agent.timezone),
        meetingMinutes: MEETING_MINUTES,
      });
    } else {
      const calendlyAccessToken = (await decryptToken(agent.calendly_access_token))!;
      const eventTypes = await listEventTypes(calendlyAccessToken, agent.calendly_user_uri);
      const eventType = eventTypes[0];
      if (!eventType) {
        return toolError(toolCallId, "agent has no active Calendly event types");
      }
      eventTypeUri = eventType.uri;
      eventTypeName = eventType.name;
      rawSlots = await getAvailableTimes(calendlyAccessToken, eventType.uri, start, end);
    }

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("agent_id", agent_id)
      .neq("status", "canceled");

    const bufferedTimes = filterSlotsWithBuffer(
      rawSlots,
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
      event_type_uri: eventTypeUri,
      event_type_name: eventTypeName,
      meeting_duration_minutes: MEETING_MINUTES,
      buffer_minutes: BUFFER_MINUTES,
      customer_timezone: customerTimezone,
      customer_timezone_label: canadaTimezoneLabel(customerTimezone),
      agent_timezone: normalizeCanadaTimezone(agent.timezone),
      agent_timezone_label: canadaTimezoneLabel(agent.timezone),
      instruction:
        "Offer times using local_time or local_time_short. Always say the timezone_label when stating times. Book with start_time (UTC ISO) only.",
      best_match: bestMatch
        ? formatSlotForCustomer(bestMatch.start_time, customerTimezone)
        : null,
      available_times: bufferedTimes.slice(0, 10).map((slot) =>
        formatSlotForCustomer(slot.start_time, customerTimezone)
      ),
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

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
  zonedDateString,
  zonedParts,
} from "../_shared/local-availability.ts";
import { DAY_PART_RANGES, parseRequestedTime } from "../_shared/parse-requested-time.ts";

const CALENDLY_MAX_WINDOW_DAYS = 7;
// Local mode has no external API to satisfy, so when the customer names a day
// further out than the default window, it's safe to widen the scan — capped
// so a garbled/typo'd date can't trigger an unbounded loop. Calendly's public
// API rejects any start/end span over 7 days, so Calendly-mode agents keep
// the original 7-day cap unconditionally (see windowDays below).
const LOCAL_MAX_SEARCH_DAYS = 35;

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

    // Every one of these only depends on agent_id/customer_id, already known
    // from call metadata — run them concurrently instead of one round-trip
    // at a time, since the assistant is waiting on the phone for this.
    const [{ data: customer }, { data: agent, error: agentError }, hours, { data: existingAppointments }] =
      await Promise.all([
        customer_id
          ? supabase.from("customers").select("timezone").eq("id", customer_id).maybeSingle()
          : Promise.resolve({ data: null as { timezone: string | null } | null }),
        supabase
          .from("sales_agents")
          .select("id, name, timezone, calendly_access_token, calendly_user_uri")
          .eq("id", agent_id)
          .single(),
        getAgentAvailabilityHours(agent_id),
        supabase
          .from("appointments")
          .select("scheduled_at, duration_minutes")
          .eq("agent_id", agent_id)
          .neq("status", "canceled"),
      ]);

    const customerTimezone = normalizeCanadaTimezone(customer?.timezone);

    if (agentError || !agent) {
      return toolError(toolCallId, "agent not found", 404);
    }

    const localMode = hours.length > 0;

    if (!localMode && (!agent.calendly_access_token || !agent.calendly_user_uri)) {
      return toolError(
        toolCallId,
        "agent has no connected Calendly account and no local availability hours set — connect one in Settings or set hours on Calendar → Availability"
      );
    }

    const start = new Date(Date.now() + 60_000);

    // What day/time the customer actually asked for, resolved against their
    // own timezone (or a zone they explicitly named, e.g. "Saturday morning
    // Atlantic") — see parse-requested-time.ts for why this can't just be
    // `new Date(requested_time)`.
    const parsedRequest = parseRequestedTime(requested_time, start, customerTimezone);

    let windowDays = Math.min(
      search_days ?? CALENDLY_MAX_WINDOW_DAYS,
      CALENDLY_MAX_WINDOW_DAYS
    );
    if (localMode && parsedRequest.targetDate) {
      const daysUntilTarget = Math.ceil(
        (new Date(`${parsedRequest.targetDate}T23:59:59Z`).getTime() - start.getTime()) /
          (24 * 60 * 60 * 1000)
      );
      windowDays = Math.min(Math.max(windowDays, daysUntilTarget + 1), LOCAL_MAX_SEARCH_DAYS);
    }
    const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);

    let eventTypeUri: string | null = null;
    let eventTypeName = agent.name;
    let rawSlots: { start_time: string }[];

    if (localMode) {
      // hours already fetched above — this is also what decided localMode.
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

    const bufferedTimes = filterSlotsWithBuffer(
      rawSlots,
      existingAppointments ?? [],
      MEETING_MINUTES,
      BUFFER_MINUTES
    );

    // No day preference at all (e.g. "customer is ready now") — unchanged
    // behavior: soonest slots overall, nearest one first.
    let requestedDateHasAvailability: boolean | null = null;
    let presentedSlots = bufferedTimes;
    let bestMatch: (typeof bufferedTimes)[number] | null = bufferedTimes[0] ?? null;

    if (parsedRequest.targetDate) {
      const dayZone = parsedRequest.timezone ?? customerTimezone;
      const daySlots = bufferedTimes.filter(
        (slot) => zonedDateString(new Date(slot.start_time), dayZone) === parsedRequest.targetDate
      );
      requestedDateHasAvailability = daySlots.length > 0;

      const dayPartSlots = parsedRequest.dayPart
        ? daySlots.filter((slot) => {
            const { hour } = zonedParts(new Date(slot.start_time), dayZone);
            const range = DAY_PART_RANGES[parsedRequest.dayPart!];
            return hour >= range.fromHour && hour < range.toHour;
          })
        : daySlots;

      // Requested day (or day+part) genuinely has nothing — fall back to the
      // nearest alternatives so the assistant still has something to offer,
      // but `requested_date_has_availability: false` tells it plainly, so it
      // never presents those alternatives as if they were the requested day.
      presentedSlots = dayPartSlots.length > 0 ? dayPartSlots : daySlots.length > 0 ? daySlots : bufferedTimes;

      if (parsedRequest.timeOfDay && presentedSlots.length > 0) {
        const targetMinutes = parsedRequest.timeOfDay.hour * 60 + parsedRequest.timeOfDay.minute;
        const minutesOfDay = (iso: string) => {
          const { hour, minute } = zonedParts(new Date(iso), dayZone);
          return hour * 60 + minute;
        };
        bestMatch = presentedSlots.reduce((closest, slot) => {
          const diff = Math.abs(minutesOfDay(slot.start_time) - targetMinutes);
          const closestDiff = Math.abs(minutesOfDay(closest.start_time) - targetMinutes);
          return diff < closestDiff ? slot : closest;
        }, presentedSlots[0]);
      } else {
        bestMatch = presentedSlots[0] ?? null;
      }
    }

    const instruction =
      requestedDateHasAvailability === false
        ? "The customer's requested day has NO openings — available_times below are the nearest alternative days instead, NOT that day. Tell the customer plainly that their requested day isn't available before offering these. Never say their requested day works. Offer times using local_time or local_time_short. Always say the timezone_label when stating times. Book with start_time (UTC ISO) only."
        : "Offer times using local_time or local_time_short. Always say the timezone_label when stating times. Book with start_time (UTC ISO) only.";

    return toolResult(toolCallId, {
      event_type_uri: eventTypeUri,
      event_type_name: eventTypeName,
      meeting_duration_minutes: MEETING_MINUTES,
      buffer_minutes: BUFFER_MINUTES,
      customer_timezone: customerTimezone,
      customer_timezone_label: canadaTimezoneLabel(customerTimezone),
      agent_timezone: normalizeCanadaTimezone(agent.timezone),
      agent_timezone_label: canadaTimezoneLabel(agent.timezone),
      requested_date: parsedRequest.targetDate,
      requested_date_has_availability: requestedDateHasAvailability,
      instruction,
      best_match: bestMatch
        ? formatSlotForCustomer(bestMatch.start_time, customerTimezone)
        : null,
      available_times: presentedSlots.slice(0, 10).map((slot) =>
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

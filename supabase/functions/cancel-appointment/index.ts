// Edge Function: cancel-appointment
//
// Called by the Vapi assistant when the customer rejects a time/day that
// `book-appointment` already successfully booked earlier in the same call
// (e.g. the assistant mis-heard the day and the customer corrects it right
// after hearing the confirmation read back). Cancels that appointment — and
// its Calendly event, if any — so the wrong booking doesn't sit there
// silently confirmed while the assistant negotiates a replacement time. See
// vapi/agent.md's BOOKING RULE / rebooking sections for when the assistant
// is instructed to call this.
//
// Like book-appointment and check-agent-availability, this trusts only the
// customer/agent id from call metadata (see resolveId in _shared/vapi-tool.ts)
// — never an appointment id from the model, which it has no reliable way to
// track across turns. It just looks up whichever appointment is still active
// for this customer.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { cancelAppointmentRow } from "../_shared/cancel-appointment-row.ts";
import { clearActiveCallAppointmentInsights } from "../_shared/call-insights.ts";

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

    const { reason } = parsed.args as { reason?: string };
    const customer_id = resolveId(parsed.metadata, "customerId");
    const agent_id = resolveId(parsed.metadata, "agentId");

    if (!customer_id) {
      return toolError(
        toolCallId,
        "no customer on this call — appointments can only be canceled on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, agent_id, calendly_event_uri, scheduled_at")
      .eq("customer_id", customer_id)
      .in("status", ["scheduled", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!appointment) {
      return toolResult(toolCallId, {
        canceled: false,
        message: "no active appointment found for this customer to cancel",
      });
    }

    const { calendlyWarning } = await cancelAppointmentRow(
      appointment,
      reason || "Customer said the booked time/day was wrong; canceled during the call."
    );

    if (agent_id) {
      await clearActiveCallAppointmentInsights(customer_id, agent_id);
    }

    return toolResult(toolCallId, {
      canceled: true,
      appointment_id: appointment.id,
      previous_start_time: appointment.scheduled_at,
      warning: calendlyWarning,
    });
  } catch (err) {
    console.error(err);
    return toolError(toolCallId, err instanceof Error ? err.message : "internal error", 500);
  }
});

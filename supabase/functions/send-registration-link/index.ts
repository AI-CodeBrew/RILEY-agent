// Edge Function: send-registration-link
//
// Called by the Vapi assistant on RECPAZ (Globe Life A.O.) calls once the
// candidate's email is confirmed. RECPAZ doesn't schedule anything — the
// candidate registers for the webinar themselves — so this just texts them
// RECPAZ_SMS_LINK from the agent's connected Twilio number. It also records
// an appointment row (scheduled_at = when the link was sent) so the candidate
// shows on the Appointments page and in its CSV export — being in the past,
// that row never triggers send-appointment-reminders.
//
// Like book-appointment, this trusts only the customer/agent id from call
// metadata (see resolveId in _shared/vapi-tool.ts).

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { sendTwilioSms } from "../_shared/twilio-sms.ts";
import { RECPAZ_SMS_LINK } from "../_shared/sms-link.ts";
import { markActiveCallAppointmentSet } from "../_shared/call-insights.ts";

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

    const customer_id = resolveId(parsed.metadata, "customerId");
    const agent_id = resolveId(parsed.metadata, "agentId");
    if (!customer_id || !agent_id) {
      return toolError(
        toolCallId,
        "no customer or agent on this call — the link can only be sent on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();
    const [{ data: customer }, { data: agent }, { data: fromNumberRow }] = await Promise.all([
      supabase.from("customers").select("id, name, phone").eq("id", customer_id).single(),
      supabase
        .from("sales_agents")
        .select("id, name, twilio_account_sid, twilio_auth_token")
        .eq("id", agent_id)
        .single(),
      supabase
        .from("agent_phone_numbers")
        .select("phone_number")
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!customer?.phone) {
      return toolError(toolCallId, "customer has no phone number on file", 404);
    }
    if (!agent?.twilio_account_sid || !agent.twilio_auth_token || !fromNumberRow?.phone_number) {
      return toolError(toolCallId, "agent has no connected Twilio number to text from");
    }

    const authToken = await decryptToken(agent.twilio_auth_token);
    if (!authToken) {
      return toolError(toolCallId, "agent's Twilio credentials couldn't be read");
    }

    await sendTwilioSms({
      accountSid: agent.twilio_account_sid,
      authToken,
      from: fromNumberRow.phone_number,
      to: customer.phone,
      body: `Register for the Globe Life A.O. career webinar here: ${RECPAZ_SMS_LINK}`,
    });

    // One row per candidate per call — a repeated tool call in the same call
    // re-sends the text but doesn't add a second appointment.
    const sentAt = new Date().toISOString();
    const { data: recentRow } = await supabase
      .from("appointments")
      .select("id")
      .eq("customer_id", customer_id)
      .eq("sms_link", RECPAZ_SMS_LINK)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (!recentRow) {
      const { error: insertError } = await supabase.from("appointments").insert({
        customer_id,
        agent_id,
        scheduled_at: sentAt,
        sms_link: RECPAZ_SMS_LINK,
        source: "voice_agent",
        status: "confirmed",
        notes: `Globe Life A.O. webinar — registration link texted to ${customer.name} by the voice agent.`,
      });
      // The text already went out, so the candidate still hears it was sent.
      if (insertError) console.error("send-registration-link: appointment insert failed", insertError);
    }

    await supabase
      .from("customers")
      .update({ status: "appointment_set" })
      .eq("id", customer_id);

    await markActiveCallAppointmentSet(
      customer_id,
      agent_id,
      sentAt,
      agent.name,
      "Webinar registration link texted"
    );

    return toolResult(toolCallId, { sent: true });
  } catch (err) {
    console.error("send-registration-link failed", err);
    return toolError(toolCallId, err instanceof Error ? err.message : "could not send the link", 500);
  }
});

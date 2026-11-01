// Edge Function: iphone-sale-action
//
// Called by the Vapi assistant on IPHONE (SmartGadgets) calls. Three actions:
//
//   reserve       — holds the phone for HOLD_HOURS, texts the confirmation and
//                   records an appointment row so it shows on Appointments.
//   text_details  — texts the offer details the client agreed to receive.
//   email_details — emails the same details.
//
// The appointment row uses scheduled_at = when the reservation was made, like
// send-registration-link: being in the past, it never triggers
// send-appointment-reminders and never blocks a future slot in
// check-agent-availability. The hold time lives in `notes`. Nothing here holds
// real stock — the store does that from the appointment row.
//
// Like book-appointment, this trusts only the customer/agent id from call
// metadata (see resolveId in _shared/vapi-tool.ts).

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { sendTwilioSms } from "../_shared/twilio-sms.ts";
import { sendEmail } from "../_shared/email.ts";
import { markActiveCallAppointmentSet } from "../_shared/call-insights.ts";
import {
  formatSlotInTimezone,
  normalizeCanadaTimezone,
  resolveCustomerTimezone,
} from "../_shared/canada-timezones.ts";

// Demo values — replace with the store's confirmed details before calling real
// customers, here and in vapi/assistant-iphone.json.
const STORE_NAME = "SmartGadgets";
const STORE_LOCATION = "our downtown Toronto store";
const HOLD_HOURS = 48;
const CUSTOMER_OFFER = "free setup and a free case until November 30, 2026";
const EARBUDS_MODEL = "AirPods 4";

const DETAILS_TEXT =
  `${STORE_NAME}: iPhone 18 Pro from $1,749 and iPhone 18 Pro Max from $1,899, ` +
  `in black, silver, glacier and burgundy. Our customer offer includes ${CUSTOMER_OFFER}. ` +
  `Visit ${STORE_LOCATION} to see them.`;

const RESERVATION_NOTE_PREFIX = "iPhone reservation";
const MODELS = ["iPhone 18 Pro", "iPhone 18 Pro Max"];
const COLOURS = ["black", "silver", "glacier", "burgundy"];
const PAYMENT_LABELS: Record<string, string> = {
  trade_in: "trade-in",
  monthly: "monthly payments",
  undecided: "payment undecided",
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

    const customer_id = resolveId(parsed.metadata, "customerId");
    const agent_id = resolveId(parsed.metadata, "agentId");
    if (!customer_id || !agent_id) {
      return toolError(
        toolCallId,
        "no customer or agent on this call — this can only run on a call placed from the portal"
      );
    }

    const { action, model, colour, payment, trade_in_phone, earbuds_included, email } = parsed.args;

    const supabase = getSupabaseAdmin();
    const [{ data: customer }, { data: agent }, { data: fromNumberRow }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone, email, timezone, province")
        .eq("id", customer_id)
        .single(),
      supabase
        .from("sales_agents")
        .select("id, name, timezone, twilio_account_sid, twilio_auth_token")
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

    if (!customer) {
      return toolError(toolCallId, "customer not found", 404);
    }

    if (action === "email_details") {
      const to = optionalText(email) ?? customer.email;
      if (!to) return toolError(toolCallId, "no email address for this client");
      if (!Deno.env.get("RESEND_API_KEY")) {
        return toolError(toolCallId, "email isn't set up on this account");
      }
      await sendEmail({
        to,
        subject: `Your ${STORE_NAME} iPhone 18 details`,
        html: `<p>${DETAILS_TEXT}</p>`,
      });
      return toolResult(toolCallId, { emailed: true });
    }

    // Returns false instead of throwing, so a texting problem never loses a
    // reservation the client already agreed to.
    const textCustomer = async (message: string) => {
      if (
        !customer.phone ||
        !agent?.twilio_account_sid ||
        !agent.twilio_auth_token ||
        !fromNumberRow?.phone_number
      ) {
        return false;
      }
      try {
        const authToken = await decryptToken(agent.twilio_auth_token);
        if (!authToken) return false;
        await sendTwilioSms({
          accountSid: agent.twilio_account_sid,
          authToken,
          from: fromNumberRow.phone_number,
          to: customer.phone,
          body: message,
        });
        return true;
      } catch (err) {
        console.error("iphone-sale-action: text failed", err);
        return false;
      }
    };

    if (action === "text_details") {
      const texted = await textCustomer(DETAILS_TEXT);
      if (!texted) return toolError(toolCallId, "the details couldn't be texted");
      return toolResult(toolCallId, { texted: true });
    }

    if (action !== "reserve") {
      return toolError(toolCallId, "action must be reserve, text_details or email_details");
    }

    if (typeof model !== "string" || !MODELS.includes(model)) {
      return toolError(toolCallId, "model must be iPhone 18 Pro or iPhone 18 Pro Max");
    }
    if (typeof colour !== "string" || !COLOURS.includes(colour)) {
      return toolError(toolCallId, "colour must be black, silver, glacier or burgundy");
    }

    const customerTimezone = resolveCustomerTimezone(
      customer.timezone,
      customer.province,
      normalizeCanadaTimezone(agent?.timezone)
    );
    const holdUntilFrom = (reservedAt: string) =>
      formatSlotInTimezone(
        new Date(new Date(reservedAt).getTime() + HOLD_HOURS * 60 * 60_000).toISOString(),
        customerTimezone
      );

    // One reservation per client per call — a repeated tool call in the same
    // call neither texts again nor adds a second row.
    const { data: recentRow } = await supabase
      .from("appointments")
      .select("created_at")
      .eq("customer_id", customer_id)
      .like("notes", `${RESERVATION_NOTE_PREFIX}%`)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recentRow) {
      return toolResult(toolCallId, {
        reserved: true,
        texted: true,
        hold_until: holdUntilFrom(recentRow.created_at),
      });
    }

    const reservedAt = new Date().toISOString();
    const holdUntil = holdUntilFrom(reservedAt);
    const withEarbuds = earbuds_included === true;
    const tradeInPhone = optionalText(trade_in_phone);
    const paymentLabel = PAYMENT_LABELS[String(payment)] ?? PAYMENT_LABELS.undecided;
    const notes =
      `${RESERVATION_NOTE_PREFIX} — ${model} in ${colour}, ${paymentLabel}` +
      (tradeInPhone ? ` (trading in ${tradeInPhone})` : "") +
      (withEarbuds ? `, free ${EARBUDS_MODEL} included` : "") +
      `, held until ${holdUntil}. Reserved for ${customer.name} by the voice agent.`;

    const { error: insertError } = await supabase.from("appointments").insert({
      customer_id,
      agent_id,
      scheduled_at: reservedAt,
      source: "voice_agent",
      status: "confirmed",
      notes,
    });
    if (insertError) {
      console.error("iphone-sale-action: appointment insert failed", insertError);
      return toolError(toolCallId, "the reservation couldn't be saved", 500);
    }

    await supabase.from("customers").update({ status: "appointment_set" }).eq("id", customer_id);

    await markActiveCallAppointmentSet(customer_id, agent_id, reservedAt, agent?.name ?? STORE_NAME, notes);

    const texted = await textCustomer(
      `${STORE_NAME}: your ${model} in ${colour} is reserved until ${holdUntil}.` +
        (withEarbuds ? ` Your free ${EARBUDS_MODEL} are included.` : "") +
        ` Pick it up at ${STORE_LOCATION}. Your offer includes ${CUSTOMER_OFFER}.`
    );

    return toolResult(toolCallId, { reserved: true, texted, hold_until: holdUntil });
  } catch (err) {
    console.error("iphone-sale-action failed", err);
    return toolError(toolCallId, err instanceof Error ? err.message : "could not complete the action", 500);
  }
});

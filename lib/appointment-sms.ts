import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptToken } from "@/lib/token-crypto";
import { sendTwilioSms } from "@/lib/twilio";
import { normalizeCanadaTimezone, resolveCustomerTimezone } from "@/lib/canada-timezones";
import type { Customer } from "@/types/database";

/** Same copy format as supabase/functions/_shared/local-time.ts, so a manually-added appointment's text reads like one Riley booked. */
function formatLocalTime(scheduledAtIso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(scheduledAtIso));
  } catch {
    return new Date(scheduledAtIso).toUTCString();
  }
}

/**
 * Confirmation texts for an appointment added by hand in the portal — one to
 * the customer, one to the agent's own phone — sent from the agent's
 * connected Twilio number. Mirrors sendBookingConfirmationSms in the
 * book-appointment Edge Function (which covers appointments Riley books on a
 * call), including being best-effort: no connected Twilio account/number or a
 * failed send never blocks the appointment being saved. The 1-hour reminder
 * needs nothing here — send-appointment-reminders picks up every
 * scheduled/confirmed appointment regardless of source.
 */
export async function sendManualAppointmentConfirmationSms({
  agentId,
  customer,
  scheduledAtIso,
  zoomLink,
}: {
  agentId: string;
  customer: Pick<Customer, "name" | "phone" | "timezone" | "province">;
  scheduledAtIso: string;
  zoomLink: string | null;
}) {
  try {
    const [{ data: agent }, { data: fromNumberRow }] = await Promise.all([
      supabaseAdmin
        .from("sales_agents")
        .select("name, phone, timezone, twilio_account_sid, twilio_auth_token")
        .eq("id", agentId)
        .single(),
      supabaseAdmin
        .from("agent_phone_numbers")
        .select("phone_number")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!agent?.twilio_account_sid || !agent.twilio_auth_token || !fromNumberRow?.phone_number) {
      return;
    }
    const authToken = await decryptToken(agent.twilio_auth_token);
    if (!authToken) return;

    const agentTimezone = normalizeCanadaTimezone(agent.timezone);
    const linkSuffix = zoomLink ? ` Join here: ${zoomLink}` : "";
    const messages = [
      {
        to: customer.phone,
        body:
          `Your appointment with ${agent.name} is confirmed for ${formatLocalTime(
            scheduledAtIso,
            resolveCustomerTimezone(customer.timezone, customer.province, agentTimezone)
          )}.` + linkSuffix,
      },
      {
        to: agent.phone,
        body:
          `New appointment: ${customer.name} is booked with you for ${formatLocalTime(
            scheduledAtIso,
            agentTimezone
          )}.` + linkSuffix,
      },
    ];

    // One recipient failing (bad number, carrier block) mustn't cost the other their text.
    await Promise.all(
      messages.map(async ({ to, body }) => {
        if (!to) return;
        try {
          await sendTwilioSms({
            accountSid: agent.twilio_account_sid!,
            authToken,
            from: fromNumberRow.phone_number,
            to,
            body,
          });
        } catch (err) {
          console.warn("appointments: could not send confirmation SMS", err);
        }
      })
    );
  } catch (err) {
    console.warn("appointments: could not send confirmation SMS", err);
  }
}

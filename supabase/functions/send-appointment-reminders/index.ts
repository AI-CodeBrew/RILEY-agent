// Edge Function: send-appointment-reminders
//
// Texts each customer once, ~1 hour before their appointment, from the
// agent's own connected Twilio number. Invoked on a schedule by pg_cron
// (see 00000000000035_appointment_sms_reminders.sql) — same backstop
// pattern as reconcile-live-calls, polling every 5 minutes rather than
// reacting to an event, since nothing else fires "an hour before" on its
// own.
//
// reminder_sent_at is the idempotency guard: a 10-minute lookahead window
// polled every 5 minutes means most appointments get checked twice before
// they age out of the window, so without it customers would get two texts.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { verifyCronSecret } from "../_shared/cron-auth.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { sendTwilioSms } from "../_shared/twilio-sms.ts";
import { formatLocalTime } from "../_shared/local-time.ts";

// Appointments starting in [55, 65] minutes from now get a reminder. Wider
// than the 5-minute cron interval so a single missed/slow tick can't skip an
// appointment entirely.
const REMINDER_LEAD_MS = 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;

interface ReminderRow {
  id: string;
  scheduled_at: string;
  zoom_link: string | null;
  customer: { phone: string; name: string; timezone: string | null } | null;
  agent: {
    id: string;
    name: string;
    timezone: string;
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (!verifyCronSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_LEAD_MS - WINDOW_MS).toISOString();
  const windowEnd = new Date(now + REMINDER_LEAD_MS + WINDOW_MS).toISOString();

  const { data: rows, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_at, zoom_link, customer:customers(phone, name, timezone), agent:sales_agents(id, name, timezone, twilio_account_sid, twilio_auth_token)"
    )
    .in("status", ["scheduled", "confirmed"])
    .is("reminder_sent_at", null)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const candidates = (rows ?? []) as unknown as ReminderRow[];
  const results: Array<{ appointmentId: string; sent?: boolean; skipped?: string; error?: string }> = [];

  for (const row of candidates) {
    try {
      if (!row.customer?.phone) {
        results.push({ appointmentId: row.id, skipped: "no customer phone" });
        continue;
      }
      if (!row.agent?.twilio_account_sid || !row.agent.twilio_auth_token) {
        results.push({ appointmentId: row.id, skipped: "agent has no connected Twilio account" });
        continue;
      }

      const { data: fromNumberRow } = await supabase
        .from("agent_phone_numbers")
        .select("phone_number")
        .eq("agent_id", row.agent.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!fromNumberRow?.phone_number) {
        results.push({ appointmentId: row.id, skipped: "agent has no connected phone number" });
        continue;
      }

      const authToken = await decryptToken(row.agent.twilio_auth_token);
      if (!authToken) {
        results.push({ appointmentId: row.id, skipped: "could not decrypt agent Twilio auth token" });
        continue;
      }

      const localTime = formatLocalTime(
        row.scheduled_at,
        row.customer.timezone || row.agent.timezone
      );
      const body =
        `Reminder: your appointment with ${row.agent.name} is in about 1 hour, at ${localTime}.` +
        (row.zoom_link ? ` Join here: ${row.zoom_link}` : "");

      await sendTwilioSms({
        accountSid: row.agent.twilio_account_sid,
        authToken,
        from: fromNumberRow.phone_number,
        to: row.customer.phone,
        body,
      });

      await supabase
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id);

      results.push({ appointmentId: row.id, sent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`send-appointment-reminders: failed for appointment ${row.id}:`, message);
      results.push({ appointmentId: row.id, error: message });
    }
  }

  return jsonResponse({ checked: candidates.length, results });
});

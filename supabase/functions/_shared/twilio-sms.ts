/**
 * Deno-side Twilio REST helper, kept separate from lib/twilio.ts (Node/Next
 * runtime) since Edge Functions can't import it directly. Only SMS sending
 * lives here — number provisioning stays a portal-only (Next.js) concern.
 */

const TWILIO_BASE_URL = "https://api.twilio.com/2010-04-01";

function twilioAuthHeader(accountSid: string, authToken: string) {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

export async function sendTwilioSms({
  accountSid,
  authToken,
  from,
  to,
  body,
}: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const res = await fetch(`${TWILIO_BASE_URL}/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });

  if (!res.ok) {
    throw new Error(`Twilio SMS send failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as { sid: string };
}

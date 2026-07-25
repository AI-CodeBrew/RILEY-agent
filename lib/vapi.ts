const VAPI_BASE_URL = "https://api.vapi.ai";

interface TriggerCallParams {
  customerName: string;
  customerPhone: string;
  customerId: string;
  agentId: string;
  agentName: string;
  /** Agent's own Vapi phone number ID (see importTwilioPhoneNumber). Falls
   * back to VAPI_PHONE_NUMBER_ID if the agent hasn't requested one yet. */
  phoneNumberId?: string | null;
}

/**
 * Starts an outbound call via Vapi, which places the call through Twilio
 * under the hood. `metadata` is echoed back on every Vapi webhook event
 * (including end-of-call), so vapi-webhook-handler can look up the
 * customer/agent without any extra state.
 */
export async function triggerOutboundCall({
  customerName,
  customerPhone,
  customerId,
  agentId,
  agentName,
  phoneNumberId,
}: TriggerCallParams) {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const resolvedPhoneNumberId = phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID;

  if (!apiKey || !assistantId || !resolvedPhoneNumberId) {
    throw new Error(
      "Missing VAPI_API_KEY, VAPI_ASSISTANT_ID, or a phone number to call from — " +
        "either set VAPI_PHONE_NUMBER_ID or have this agent request their own number on the /agents page."
    );
  }

  const res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId: resolvedPhoneNumberId,
      customer: {
        number: customerPhone,
        name: customerName,
      },
      assistantOverrides: {
        variableValues: {
          customerName,
          agentName,
        },
        metadata: {
          customerId,
          agentId,
        },
      },
      metadata: {
        customerId,
        agentId,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi call failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<{ id: string; [key: string]: unknown }>;
}

/**
 * Registers a Twilio number (already purchased under the business's Twilio
 * account — see lib/twilio.ts) as a Vapi phone number resource, so it can
 * be used as `phoneNumberId` in triggerOutboundCall.
 */
export async function importTwilioPhoneNumber({
  agentName,
  phoneNumber,
  twilioAccountSid,
  twilioAuthToken,
}: {
  agentName: string;
  phoneNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VAPI_API_KEY environment variable.");
  }

  const res = await fetch(`${VAPI_BASE_URL}/phone-number`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "twilio",
      number: phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      name: `${agentName} (Riley Booking)`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi Twilio import failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<{ id: string; number: string; [key: string]: unknown }>;
}

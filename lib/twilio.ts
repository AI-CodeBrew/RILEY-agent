const TWILIO_BASE_URL = "https://api.twilio.com/2010-04-01";

function twilioAuthHeader(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/**
 * Finds the first available US local number, optionally narrowed to an
 * area code. Twilio trial accounts can still purchase numbers this way,
 * but outbound calls from them are restricted to caller-verified
 * destination numbers until the account is upgraded.
 */
export async function findAvailableTwilioNumber(
  accountSid: string,
  authToken: string,
  areaCode?: string
) {
  const params = new URLSearchParams({ VoiceEnabled: "true" });
  if (areaCode) params.set("AreaCode", areaCode);

  const res = await fetch(
    `${TWILIO_BASE_URL}/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?${params}`,
    { headers: { Authorization: twilioAuthHeader(accountSid, authToken) } }
  );

  if (!res.ok) {
    throw new Error(`Twilio number search failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const match = data.available_phone_numbers?.[0];
  if (!match) {
    throw new Error(
      areaCode
        ? `No available Twilio numbers found for area code ${areaCode}.`
        : "No available Twilio numbers found."
    );
  }
  return match.phone_number as string;
}

/** Purchases a Twilio number, returning its SID and E.164 number. */
export async function purchaseTwilioNumber(
  accountSid: string,
  authToken: string,
  phoneNumber: string
) {
  const res = await fetch(`${TWILIO_BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ PhoneNumber: phoneNumber }),
  });

  if (!res.ok) {
    throw new Error(`Twilio number purchase failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return { sid: data.sid as string, phoneNumber: data.phone_number as string };
}

/** Looks up a purchased number's SID when we only have the E.164 value. */
export async function findTwilioNumberSid(
  accountSid: string,
  authToken: string,
  phoneNumber: string
) {
  const params = new URLSearchParams({ PhoneNumber: phoneNumber });
  const res = await fetch(
    `${TWILIO_BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers.json?${params}`,
    { headers: { Authorization: twilioAuthHeader(accountSid, authToken) } }
  );

  if (!res.ok) {
    throw new Error(`Twilio number lookup failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.incoming_phone_numbers?.[0]?.sid as string | undefined) ?? null;
}

export async function releaseTwilioNumber(
  accountSid: string,
  authToken: string,
  numberSid: string
) {
  const res = await fetch(
    `${TWILIO_BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`,
    { method: "DELETE", headers: { Authorization: twilioAuthHeader(accountSid, authToken) } }
  );
  if (!res.ok && res.status !== 404) {
    console.error(`Failed to release Twilio number ${numberSid}: ${await res.text()}`);
  }
}

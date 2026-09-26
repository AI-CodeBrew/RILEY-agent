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

/** Lists every number purchased on the Twilio account. */
export async function listTwilioOwnedNumbers(accountSid: string, authToken: string) {
  const res = await fetch(
    `${TWILIO_BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    { headers: { Authorization: twilioAuthHeader(accountSid, authToken) } }
  );

  if (!res.ok) {
    throw new Error(`Twilio number list failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.incoming_phone_numbers ?? []).map(
    (row: { sid: string; phone_number: string }) => ({
      sid: row.sid as string,
      phoneNumber: row.phone_number as string,
    })
  );
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

/**
 * Validates an agent-supplied Account SID/Auth Token pair by fetching the
 * account itself — the same "prove the credential works" check
 * connectAgentCalendly() does against /users/me. Rejects suspended/closed
 * accounts since they can't place calls or buy numbers.
 */
export async function verifyTwilioAccount(accountSid: string, authToken: string) {
  const res = await fetch(`${TWILIO_BASE_URL}/Accounts/${accountSid}.json`, {
    headers: { Authorization: twilioAuthHeader(accountSid, authToken) },
  });

  if (!res.ok) {
    throw new Error(`Twilio account verification failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const status = data.status as string;
  if (status !== "active") {
    throw new Error(`This Twilio account is ${status}, not active — reconnect once it's active.`);
  }

  return {
    sid: data.sid as string,
    friendlyName: data.friendly_name as string,
    status,
  };
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

/**
 * Force-ends a live Twilio call (including still-ringing outbound legs).
 * Vapi's DELETE /call often returns 200 while the phone keeps ringing for
 * another ~40–50s during early dial setup — updating Status=completed on
 * the underlying Twilio CallSid is what actually cuts the PSTN leg.
 */
export async function hangupTwilioCall(
  accountSid: string,
  authToken: string,
  callSid: string
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const res = await fetch(
    `${TWILIO_BASE_URL}/Accounts/${accountSid}/Calls/${callSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }),
    }
  );

  if (res.ok || res.status === 404) {
    return { ok: true };
  }

  return { ok: false, status: res.status, body: await res.text() };
}

/** Twilio outbound Call resource status values we care about for ring-cut. */
export type TwilioCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export async function getTwilioCallStatus(
  accountSid: string,
  authToken: string,
  callSid: string
): Promise<{ status: TwilioCallStatus | string; to?: string } | null> {
  try {
    const res = await fetch(
      `${TWILIO_BASE_URL}/Accounts/${accountSid}/Calls/${callSid}.json`,
      {
        headers: { Authorization: twilioAuthHeader(accountSid, authToken) },
        // Keep short — a slow/failed GET must not delay ring detection.
        signal: AbortSignal.timeout(2000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; to?: string };
    if (!data.status) return null;
    return { status: data.status, to: data.to };
  } catch {
    return null;
  }
}

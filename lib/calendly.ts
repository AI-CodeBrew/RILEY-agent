const CALENDLY_BASE_URL = "https://api.calendly.com";

async function calendlyFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${CALENDLY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendly API error ${res.status} on ${path}: ${body}`);
  }

  return res.json();
}

export async function getCurrentCalendlyUser(accessToken: string) {
  const data = await calendlyFetch("/users/me", accessToken);
  return data.resource as {
    uri: string;
    scheduling_url: string;
    name: string;
    current_organization: string;
  };
}

/**
 * Subscribes to invitee.created / invitee.canceled for this agent's
 * Calendly account, pointed at calendly-webhook-handler, so we can flip an
 * appointment to "confirmed" (with the real event + Zoom link) once the
 * customer completes the booking link from book-appointment.
 *
 * Requires a Calendly plan that supports webhooks (Standard tier or
 * above) — callers should treat failures here as non-fatal.
 */
export async function createCalendlyWebhookSubscription(
  accessToken: string,
  {
    userUri,
    organizationUri,
    callbackUrl,
  }: { userUri: string; organizationUri: string; callbackUrl: string }
) {
  const data = await calendlyFetch("/webhook_subscriptions", accessToken, {
    method: "POST",
    body: JSON.stringify({
      url: callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      user: userUri,
      scope: "user",
    }),
  });
  return data.resource as { uri: string; signing_key: string };
}

/**
 * Full "connect this agent's Calendly account" flow used by both the
 * create-agent and edit-agent API routes: validates the PAT, resolves the
 * agent's user URI, and (best-effort) subscribes to booking-confirmation
 * webhooks. Webhook subscription failures are logged and swallowed rather
 * than thrown — a bad Calendly plan tier shouldn't block saving the agent,
 * it just means appointments won't auto-confirm for them.
 */
export async function connectAgentCalendly(
  accessToken: string,
  previousWebhookUri?: string | null
) {
  const user = await getCurrentCalendlyUser(accessToken);

  if (previousWebhookUri) {
    await deleteCalendlyWebhookSubscription(accessToken, previousWebhookUri);
  }

  let webhook: { uri: string; signing_key: string } | null = null;
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error("SUPABASE_URL not set");
    webhook = await createCalendlyWebhookSubscription(accessToken, {
      userUri: user.uri,
      organizationUri: user.current_organization,
      callbackUrl: `${supabaseUrl}/functions/v1/calendly-webhook-handler`,
    });
  } catch (err) {
    console.error(
      `Calendly webhook subscription failed for ${user.uri} (appointments for this agent won't auto-confirm):`,
      err
    );
  }

  return {
    calendly_user_uri: user.uri,
    calendly_webhook_uri: webhook?.uri ?? null,
    calendly_webhook_signing_key: webhook?.signing_key ?? null,
  };
}

/**
 * Cancels the real Calendly event behind an appointment, so canceling from
 * the portal also frees the slot on the agent's calendar and sends
 * Calendly's own cancellation notice to the customer.
 *
 * Only works once `invitee.created` has landed and replaced the placeholder
 * booking URL with a real `calendly_event_uri` — appointments still waiting
 * on the customer to click through have no event to cancel yet.
 */
export async function cancelCalendlyEvent(
  accessToken: string,
  eventUri: string,
  reason?: string
) {
  const uuid = eventUri.split("/").pop();
  if (!uuid) throw new Error(`Unrecognized Calendly event URI: ${eventUri}`);

  await calendlyFetch(`/scheduled_events/${uuid}/cancellation`, accessToken, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "Canceled by the sales agent" }),
  });
}

/** True for URIs that point at a real scheduled event rather than a booking link. */
export function isCalendlyEventUri(uri: string | null | undefined) {
  return Boolean(uri?.startsWith("https://api.calendly.com/scheduled_events/"));
}

export async function deleteCalendlyWebhookSubscription(
  accessToken: string,
  webhookUri: string
) {
  const id = webhookUri.split("/").pop();
  const res = await fetch(`${CALENDLY_BASE_URL}/webhook_subscriptions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404 just means it's already gone — fine either way.
  if (!res.ok && res.status !== 404) {
    console.error(`Failed to delete Calendly webhook ${webhookUri}: ${await res.text()}`);
  }
}

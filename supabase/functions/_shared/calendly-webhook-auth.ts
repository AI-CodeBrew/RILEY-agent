/**
 * Verifies Calendly's webhook signature: the `Calendly-Webhook-Signature`
 * header is `t=<unix ts>,v1=<hex hmac>` where the hmac is
 * HMAC-SHA256(signing_key, `${t}.${rawBody}`). The signing key is unique
 * per webhook subscription (returned once at creation time and stored on
 * sales_agents.calendly_webhook_signing_key).
 * https://developer.calendly.com/api-docs/webhook-signatures
 */
export async function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  signingKey: string
): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const expectedSignature = parts["v1"];
  if (!timestamp || !expectedSignature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  const computedSignature = [...new Uint8Array(sigBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedSignature.length !== expectedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    diff |= computedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return diff === 0;
}

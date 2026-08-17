/**
 * Encrypts third-party API tokens (Calendly, Twilio) before they hit the
 * `sales_agents` table, so a DB backup or service-role key leak doesn't also
 * hand over live third-party account access. AES-256-GCM via the platform's
 * native Web Crypto API — no extra dependency, and the same primitive is
 * available in the Deno Edge Functions runtime that reads these values back
 * (see supabase/functions/_shared/token-crypto.ts, which must stay
 * byte-compatible with this file).
 *
 * Stored shape: "v1:" + base64(iv(12 bytes) || ciphertext+tag). Values
 * without the "v1:" prefix are treated as legacy plaintext and returned
 * as-is (with a warning) rather than rejected — existing rows self-heal to
 * encrypted the next time an agent reconnects Calendly/Twilio, so there's
 * no bulk-backfill migration touching live secrets.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/token-crypto.ts must never be imported in browser/client code.");
}

const VERSION_PREFIX = "v1:";
const IV_BYTES = 12;

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const encoded = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("Missing TOKEN_ENCRYPTION_KEY environment variable.");
  }

  const raw = Buffer.from(encoded, "base64");
  if (raw.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${raw.length}) — generate one with 'openssl rand -base64 32'.`
    );
  }

  cachedKey = crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return VERSION_PREFIX + Buffer.from(combined).toString("base64");
}

export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;

  if (!stored.startsWith(VERSION_PREFIX)) {
    console.warn(
      "token-crypto: read a legacy plaintext token — it will be encrypted next time it's saved."
    );
    return stored;
  }

  const key = await getKey();
  const combined = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");
  const iv = combined.subarray(0, IV_BYTES);
  const ciphertext = combined.subarray(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

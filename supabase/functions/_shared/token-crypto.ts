/**
 * Deno-side mirror of lib/token-crypto.ts — must stay byte-compatible (same
 * "v1:" + base64(iv || ciphertext+tag) shape, same AES-256-GCM/12-byte-IV
 * scheme) since Next.js writes these tokens and Edge Functions read them
 * back. See lib/token-crypto.ts for the full rationale.
 */

const VERSION_PREFIX = "v1:";
const IV_BYTES = 12;

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const encoded = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!encoded) {
    throw new Error("Missing TOKEN_ENCRYPTION_KEY environment variable.");
  }

  const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
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

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
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

  return VERSION_PREFIX + toBase64(combined);
}

export async function decryptToken(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return null;

  if (!stored.startsWith(VERSION_PREFIX)) {
    console.warn(
      "token-crypto: read a legacy plaintext token — it will be encrypted next time it's saved."
    );
    return stored;
  }

  const key = await getKey();
  const combined = fromBase64(stored.slice(VERSION_PREFIX.length));
  const iv = combined.subarray(0, IV_BYTES);
  const ciphertext = combined.subarray(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Vapi signs server/tool requests with a shared secret configured on the
 * assistant (`server.secret` for the end-of-call webhook, and per-tool
 * `server.secret` for function-calling tools). Vapi sends it back as the
 * `x-vapi-secret` header on every request. Reject anything that doesn't
 * match so these public Edge Function URLs can't be hit by randoms.
 *
 * These functions have `verify_jwt = false` in config.toml, so this is the
 * *only* access control on them — an unconfigured secret must reject, not
 * open the door.
 */
export function verifyVapiSecret(req: Request): boolean {
  const expected = Deno.env.get("VAPI_SERVER_SECRET");
  if (!expected) return false;
  return req.headers.get("x-vapi-secret") === expected;
}

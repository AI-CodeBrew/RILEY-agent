/**
 * Guards internal, cron-triggered functions (not called by Vapi or any
 * public client). The pg_cron job sends this as a bearer token via
 * `net.http_post` headers — see the migration that schedules it.
 *
 * This function has `verify_jwt = false` in config.toml, so this is the
 * *only* access control on it — an unconfigured secret must reject, not
 * open the door.
 */
export function verifyCronSecret(req: Request): boolean {
  const expected = Deno.env.get("RECONCILE_CRON_SECRET");
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

/**
 * Guards internal, cron-triggered functions (not called by Vapi or any
 * public client). The pg_cron job sends this as a bearer token via
 * `net.http_post` headers — see the migration that schedules it.
 */
export function verifyCronSecret(req: Request): boolean {
  const expected = Deno.env.get("RECONCILE_CRON_SECRET");
  if (!expected) return true; // not configured yet — allow through in dev
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

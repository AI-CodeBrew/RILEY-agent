/** Cancel an in-flight Vapi call (portal Hang up path). */
import { createClient } from "@supabase/supabase-js";

const vapiCallId = process.argv[2];
if (!vapiCallId) {
  console.error("Usage: node --env-file=.env.local --import tsx scripts/test-vapi-hangup-only.mjs <vapi_call_id>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { cancelVapiCall } = await import("../lib/vapi.ts");

const { data: row } = await supabase
  .from("calls")
  .select("id, control_url")
  .eq("vapi_call_id", vapiCallId)
  .maybeSingle();

console.log("Before cancel…");
const before = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
  headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
}).then((r) => r.json());
console.log("  Vapi:", before.status, before.endedReason ?? "—");

const t0 = Date.now();
try {
  await cancelVapiCall({ callId: vapiCallId, controlUrl: row?.control_url ?? null });
  console.log(`cancelVapiCall OK (+${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} catch (err) {
  console.error(`cancelVapiCall FAIL (+${((Date.now() - t0) / 1000).toFixed(1)}s):`, err.message);
}

for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const v = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  }).then((r) => r.json());
  console.log(`  [+${((Date.now() - t0) / 1000).toFixed(1)}s] Vapi ${v.status} ${v.endedReason ?? "—"}`);
  if (v.status === "ended") break;
}

if (row?.id) {
  const { data: updated } = await supabase
    .from("calls")
    .select("status, ended_reason")
    .eq("id", row.id)
    .single();
  console.log("DB:", updated?.status, updated?.ended_reason ?? "—");
}

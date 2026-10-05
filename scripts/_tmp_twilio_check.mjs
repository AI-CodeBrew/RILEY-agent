// Read-only diagnostic: compares Twilio's record of James's last calls with Vapi's.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const agentId = "4c8d142a-5751-44fe-bc9b-f593d93c9012";

async function decrypt(v) {
  const mod = await import("../lib/token-crypto.ts").catch(() => null);
  if (mod?.decryptToken) return mod.decryptToken(v);
  return null;
}

const { data: agent } = await sb.from("sales_agents").select("twilio_account_sid, twilio_auth_token").eq("id", agentId).single();
const token = await decrypt(agent.twilio_auth_token);
if (!token) { console.log("could not decrypt twilio token"); process.exit(1); }
const auth = "Basic " + Buffer.from(`${agent.twilio_account_sid}:${token}`).toString("base64");
const tw = (p) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${agent.twilio_account_sid}${p}`, { headers: { Authorization: auth } }).then((r) => r.json());
const vapi = (id) => fetch(`https://api.vapi.ai/call/${id}`, { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } }).then((r) => r.json());

const { data: calls } = await sb.from("calls").select("id, vapi_call_id, created_at, call_insights").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(10);

for (const c of calls) {
  const v = await vapi(c.vapi_call_id);
  const sid = v.phoneCallProviderId ?? v.transport?.callSid;
  const t = sid ? await tw(`/Calls/${sid}.json`) : {};
  const ev = sid ? await tw(`/Calls/${sid}/Events.json?PageSize=50`) : {};
  const t0 = new Date(v.createdAt).getTime();
  const rel = (iso) => (iso ? ((new Date(iso).getTime() - t0) / 1000).toFixed(1) + "s" : "—");
  console.log(`\n=== ${c.created_at}  sid=${sid}`);
  console.log(`twilio: status=${t.status} answered_by=${t.answered_by} dir=${t.direction} start=${rel(t.start_time)} end=${rel(t.end_time)} dur=${t.duration}s parent=${t.parent_call_sid} to=${t.to?.slice(0, 5)}…`);
  console.log(`vapi: started=${rel(v.startedAt)} ended=${rel(v.endedAt)} reason=${v.endedReason}`);
  const msgs = (v.artifact?.messages ?? v.messages ?? []).filter((m) => m.role === "user" || m.role === "bot" || m.role === "assistant").slice(0, 4);
  for (const m of msgs) console.log(`  ${m.role} @${m.secondsFromStart?.toFixed?.(1)}s: ${(m.message ?? "").slice(0, 90)}`);
  for (const e of ev.events ?? []) {
    const p = e.request?.parameters ?? {};
    if (p.CallStatus) console.log(`  twilio-event ${rel(p.Timestamp ? new Date(p.Timestamp).toISOString() : null)} CallStatus=${p.CallStatus} SipResponseCode=${p.SipResponseCode ?? ""} AnsweredBy=${p.AnsweredBy ?? ""}`);
  }
}

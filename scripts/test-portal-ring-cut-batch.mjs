/**
 * Portal-path ring-cut stress test (triggerCallForCustomer, not plain Twilio).
 *
 *   node --env-file=.env.local --import tsx scripts/test-portal-ring-cut-batch.mjs
 *
 * Env: TEST_PHONE (default +923254039356), TEST_COUNT (default 10)
 */
import dns from "node:dns/promises";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const TO = process.env.TEST_PHONE ?? "+923254039356";
const COUNT = Number(process.env.TEST_COUNT ?? 10);
const AGENT_ID = process.env.TEST_AGENT_ID ?? "867569b6-0bb2-4d34-a8a8-f458f010a21b";
const MAX_WAIT_MS = 55_000;
const PASS_RING_MIN = 10;
const PASS_RING_MAX = 16; // dead before ~16s fax

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function twilioRequest(sid, token, method, path, formBody) {
  const ips = await dns.resolve4("api.twilio.com");
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = formBody ? new URLSearchParams(formBody).toString() : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ips[0],
        servername: "api.twilio.com",
        path,
        method,
        headers: {
          Host: "api.twilio.com",
          Authorization: `Basic ${auth}`,
          ...(body
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || "{}") });
          } catch {
            resolve({ status: res.statusCode, json: { raw: data } });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loadFixtures() {
  const { data: agent, error } = await supabase
    .from("sales_agents")
    .select("*")
    .eq("id", AGENT_ID)
    .single();
  if (error || !agent) throw new Error(error?.message ?? "agent not found");

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("agent_id", AGENT_ID)
    .neq("status", "do_not_call")
    .limit(1);
  if (!customers?.length) throw new Error("no customer");

  const customer = customers[0];
  customer.phone = TO;
  return { agent, customer };
}

async function oneCall(n, agent, customer) {
  const { triggerCallForCustomer } = await import("../lib/trigger-call.ts");
  const apiKey = process.env.VAPI_API_KEY;
  const dialStart = Date.now();

  const { call, vapi_call: vapiCall } = await triggerCallForCustomer({
    customer,
    agent,
    triggeredBy: agent.id,
  });

  const vapiCallId = vapiCall.id;
  console.log(`\n=== Call ${n}/${COUNT} row=${call.id} vapi=${vapiCallId} ===`);

  let callSid = null;
  let ringingAt = null;
  let endedAt = null;
  let lastTwilio = "—";
  let lastVapi = "—";
  let endedReason = null;

  while (Date.now() - dialStart < MAX_WAIT_MS) {
    const vapiRes = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const vapi = await vapiRes.json();
    lastVapi = vapi.status ?? "—";
    endedReason = vapi.endedReason ?? endedReason;
    callSid =
      (typeof vapi.phoneCallProviderId === "string" && vapi.phoneCallProviderId.startsWith("CA")
        ? vapi.phoneCallProviderId
        : null) ??
      vapi.transport?.callSid ??
      callSid;

    if (callSid) {
      const tw = await twilioRequest(
        agent.twilio_account_sid,
        agent.twilio_auth_token,
        "GET",
        `/2010-04-01/Accounts/${agent.twilio_account_sid}/Calls/${callSid}.json`
      );
      lastTwilio = tw.json.status ?? "—";
    }

    const dialSec = ((Date.now() - dialStart) / 1000).toFixed(1);
    const ringSec =
      ringingAt != null ? ((Date.now() - ringingAt) / 1000).toFixed(1) : null;
    console.log(
      `  [dial+${dialSec}s] Vapi=${lastVapi} Twilio=${lastTwilio}` +
        (ringSec != null ? ` ring+${ringSec}s` : "")
    );

    if (!ringingAt && (lastTwilio === "ringing" || lastVapi === "ringing")) {
      ringingAt = Date.now();
      console.log("  → RINGING");
    }

    const terminalTwilio = ["canceled", "completed", "busy", "failed", "no-answer"].includes(
      lastTwilio
    );
    const terminalVapi = lastVapi === "ended";

    if (terminalTwilio || terminalVapi) {
      endedAt = Date.now();
      break;
    }

    if (lastTwilio === "in-progress" || lastVapi === "in-progress") {
      endedAt = Date.now();
      // Force hangup so we don't leave a live call
      if (callSid) {
        await twilioRequest(
          agent.twilio_account_sid,
          agent.twilio_auth_token,
          "POST",
          `/2010-04-01/Accounts/${agent.twilio_account_sid}/Calls/${callSid}.json`,
          { Status: "completed" }
        );
      }
      return {
        n,
        pass: false,
        reason: "answered",
        dialSec: (endedAt - dialStart) / 1000,
        ringSec: ringingAt ? (endedAt - ringingAt) / 1000 : null,
        didRing: Boolean(ringingAt),
        endedReason: "answered",
        twilio: lastTwilio,
        vapi: lastVapi,
        callId: call.id,
        vapiCallId,
      };
    }

    await new Promise((r) => setTimeout(r, 700));
  }

  if (!endedAt) endedAt = Date.now();

  const { data: row } = await supabase
    .from("calls")
    .select("status, ended_reason, outcome, call_insights")
    .eq("id", call.id)
    .single();

  const dialSec = (endedAt - dialStart) / 1000;
  const ringSec = ringingAt ? (endedAt - ringingAt) / 1000 : null;
  const didRing = Boolean(ringingAt);
  const cutOk =
    didRing &&
    ringSec != null &&
    ringSec >= PASS_RING_MIN &&
    ringSec < PASS_RING_MAX;

  const result = {
    n,
    pass: cutOk,
    reason: !didRing
      ? `no-ring (twilio=${lastTwilio} vapi=${lastVapi})`
      : cutOk
        ? "cut-in-window"
        : ringSec != null && ringSec < PASS_RING_MIN
          ? "cut-too-early"
          : "cut-too-late-or-no-cut",
    dialSec: Number(dialSec.toFixed(1)),
    ringSec: ringSec != null ? Number(ringSec.toFixed(1)) : null,
    didRing,
    endedReason: endedReason ?? row?.ended_reason ?? null,
    twilio: lastTwilio,
    vapi: lastVapi,
    dbOutcome: row?.outcome ?? null,
    callId: call.id,
    vapiCallId,
  };

  console.log(
    `  → ${result.pass ? "PASS" : "FAIL"} ${result.reason} dial=${result.dialSec}s ring=${result.ringSec ?? "—"}s ended=${result.endedReason}`
  );
  return result;
}

async function main() {
  if (!process.env.VAPI_API_KEY) throw new Error("Missing VAPI_API_KEY");
  const { agent, customer } = await loadFixtures();
  console.log(
    `Portal ring-cut batch: ${COUNT} calls to ${TO}` +
      `\nAgent ${agent.name} ring_timeout_seconds=${agent.ring_timeout_seconds}` +
      `\nPass window: ring+${PASS_RING_MIN}s … <${PASS_RING_MAX}s`
  );

  const results = [];
  for (let i = 1; i <= COUNT; i++) {
    try {
      results.push(await oneCall(i, agent, customer));
    } catch (err) {
      console.error(`Call ${i} threw:`, err instanceof Error ? err.message : err);
      results.push({
        n: i,
        pass: false,
        reason: `error: ${err instanceof Error ? err.message : String(err)}`,
        dialSec: null,
        ringSec: null,
        didRing: false,
        endedReason: null,
        twilio: null,
        vapi: null,
        callId: null,
        vapiCallId: null,
      });
    }
    // Brief gap between dials
    if (i < COUNT) await new Promise((r) => setTimeout(r, 2000));
  }

  const passed = results.filter((r) => r.pass).length;
  console.log("\n========== SUMMARY ==========");
  for (const r of results) {
    console.log(
      `#${r.n} ${r.pass ? "PASS" : "FAIL"} ring=${r.ringSec ?? "—"}s dial=${r.dialSec ?? "—"}s ${r.reason} (${r.endedReason ?? "—"})`
    );
  }
  console.log(`\n${passed}/${COUNT} passed (cut after ~12–13s ring, before 16s fax)`);
  process.exit(passed === COUNT ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Live test: portal-equivalent outbound call + ring-timeout / hang-up behavior.
 *
 *   node --env-file=.env.local --import tsx scripts/test-vapi-ring-cut.mjs ring-timeout
 *   node --env-file=.env.local --import tsx scripts/test-vapi-ring-cut.mjs hang-up-early
 *
 * Env (optional):
 *   TEST_AGENT_ID, TEST_CUSTOMER_ID, TEST_PHONE — defaults to Stacey + one of her customers
 */
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2] ?? "ring-timeout";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_AGENT_ID = "867569b6-0bb2-4d34-a8a8-f458f010a21b"; // Stacey, ring_timeout 10
// Hard fail if Vapi hasn't ended by this many seconds after dial start.
const MAX_END_SEC = Number(process.env.TEST_MAX_END_SEC ?? 12);

async function loadFixtures() {
  const agentId = process.env.TEST_AGENT_ID ?? DEFAULT_AGENT_ID;
  const { data: agent, error: agentErr } = await supabase
    .from("sales_agents")
    .select("*")
    .eq("id", agentId)
    .single();
  if (agentErr || !agent) throw new Error(`Agent ${agentId}: ${agentErr?.message ?? "not found"}`);

  const testPhone = process.env.TEST_PHONE?.trim();
  let customerId = process.env.TEST_CUSTOMER_ID;

  if (!customerId && testPhone) {
    const digits = testPhone.replace(/\D/g, "");
    const { data: byPhone } = await supabase
      .from("customers")
      .select("id")
      .eq("agent_id", agentId)
      .or(`phone.eq.${testPhone},phone.eq.+${digits},phone.ilike.%${digits.slice(-10)}`)
      .limit(1);
    if (byPhone?.length) customerId = byPhone[0].id;
  }

  if (!customerId) {
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("agent_id", agentId)
      .neq("status", "do_not_call")
      .limit(1);
    if (custErr || !customers?.length) {
      throw new Error(`No customer for agent — set TEST_CUSTOMER_ID. ${custErr?.message ?? ""}`);
    }
    customerId = customers[0].id;
  }

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();
  if (cErr || !customer) throw new Error(`Customer ${customerId}: ${cErr?.message ?? "not found"}`);

  // Override dial target without mutating DB (for one-off live tests).
  if (testPhone) {
    customer.phone = testPhone.startsWith("+") ? testPhone : `+${testPhone.replace(/\D/g, "")}`;
  }

  return { agent, customer };
}

async function pollVapi(vapiCallId, apiKey, untilMs, twilio = null) {
  const start = Date.now();
  let ringingAtMs = null;
  while (Date.now() - start < untilMs) {
    const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await res.json();
    const t = ((Date.now() - start) / 1000).toFixed(1);

    let twStatus = null;
    const callSid =
      (typeof body.phoneCallProviderId === "string" && body.phoneCallProviderId.startsWith("CA")
        ? body.phoneCallProviderId
        : null) ?? body.transport?.callSid ?? null;
    if (twilio?.sid && twilio?.token && callSid) {
      const auth = Buffer.from(`${twilio.sid}:${twilio.token}`).toString("base64");
      try {
        const twRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Calls/${callSid}.json`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        if (twRes.ok) {
          const tw = await twRes.json();
          twStatus = tw.status;
          if (tw.status === "ringing" && ringingAtMs == null) {
            ringingAtMs = Date.now();
            console.log(
              `  [${t}s] Vapi=${body.status} Twilio=ringing to=${tw.to}  ← phone should be ringing now`
            );
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
        }
      } catch {
        // ignore
      }
    }

    if (body.status === "ringing" && ringingAtMs == null) {
      ringingAtMs = Date.now();
    }

    const sinceRing =
      ringingAtMs != null ? ((Date.now() - ringingAtMs) / 1000).toFixed(1) : null;
    console.log(
      `  [${t}s] Vapi=${body.status} Twilio=${twStatus ?? "—"} endedReason=${body.endedReason ?? "—"}` +
        (sinceRing != null ? ` (ring+${sinceRing}s)` : "")
    );

    if (body.status === "ended" || twStatus === "canceled" || twStatus === "completed") {
      const endedAtSec = Number(t);
      const ringToEndSec =
        ringingAtMs != null ? Number(((Date.now() - ringingAtMs) / 1000).toFixed(1)) : null;
      return {
        ended: true,
        endedAtSec,
        ringToEndSec,
        didRing: ringingAtMs != null,
        endedReason: body.endedReason ?? twStatus ?? null,
      };
    }
    if (body.status === "in-progress" || twStatus === "in-progress") {
      return {
        ended: false,
        endedAtSec: null,
        ringToEndSec: null,
        didRing: true,
        endedReason: "answered",
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    ended: false,
    endedAtSec: null,
    ringToEndSec: null,
    didRing: ringingAtMs != null,
    endedReason: null,
  };
}

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("Missing VAPI_API_KEY");

  const { triggerCallForCustomer } = await import("../lib/trigger-call.ts");
  const { forceEndOutboundCall } = await import("../lib/force-end-call.ts");

  const { agent, customer } = await loadFixtures();
  const phoneTail = String(customer.phone ?? "").slice(-4);
  const ringTimeout = Math.min(agent.ring_timeout_seconds ?? 10, 10);
  console.log(`Mode: ${mode}`);
  console.log(`Agent: ${agent.name} ring_timeout_seconds=${agent.ring_timeout_seconds} (enforced=${ringTimeout})`);
  console.log(`Customer: ${customer.name} phone=${customer.phone} (…${phoneTail})`);
  console.log(`Twilio creds on agent: ${agent.twilio_account_sid ? "yes" : "NO"}`);
  console.log(`Hard max end after RING starts: ${MAX_END_SEC}s`);

  const { call, vapi_call: vapiCall } = await triggerCallForCustomer({
    customer,
    agent,
    triggeredBy: agent.id,
  });

  const vapiCallId = vapiCall.id;
  const controlUrl = vapiCall.monitor?.controlUrl ?? call.control_url;
  console.log(`Started call row=${call.id} vapi_call_id=${vapiCallId}`);
  console.log(`Dialing ${customer.phone} — your phone should ring once setup completes.`);

  if (mode === "hang-up-early") {
    await new Promise((r) => setTimeout(r, 5000));
    console.log("forceEndOutboundCall at ~5s…");
    const result = await forceEndOutboundCall({
      vapiCallId,
      controlUrl,
      twilioAccountSid: agent.twilio_account_sid,
      twilioAuthToken: agent.twilio_auth_token,
    });
    console.log("forceEnd:", result);
    const poll = await pollVapi(vapiCallId, apiKey, (MAX_END_SEC + 5) * 1000, {
      sid: agent.twilio_account_sid,
      token: agent.twilio_auth_token,
    });
    const ok = poll.ended && poll.endedAtSec !== null && poll.endedAtSec <= MAX_END_SEC;
    console.log(ok ? `PASS: hung up at ~${poll.endedAtSec}s (max ${MAX_END_SEC}s).` : `FAIL: ended=${poll.ended} at=${poll.endedAtSec}s.`);
    process.exit(ok ? 0 : 1);
  }

  // Allow time for international dial setup (~25s) + ring budget + hangup.
  const waitMs = (25 + MAX_END_SEC + 8) * 1000;
  console.log(
    `Waiting up to ${waitMs / 1000}s — must RING on Twilio, then end within ${MAX_END_SEC}s of ringing…`
  );
  const poll = await pollVapi(vapiCallId, apiKey, waitMs, {
    sid: agent.twilio_account_sid,
    token: agent.twilio_auth_token,
  });
  const { data: row } = await supabase
    .from("calls")
    .select("status, ended_reason, outcome")
    .eq("id", call.id)
    .single();
  console.log(`DB status=${row?.status} ended_reason=${row?.ended_reason ?? "—"} outcome=${row?.outcome ?? "—"}`);

  if (!poll.didRing) {
    console.log(
      `FAIL: phone never reached ringing (ended=${poll.ended} at=${poll.endedAtSec}s reason=${poll.endedReason}). Cut too early during setup.`
    );
    process.exit(1);
  }
  if (poll.endedReason === "answered") {
    console.log("INFO: call was answered — ring-timeout correctly skipped.");
    process.exit(0);
  }
  if (poll.ended && poll.ringToEndSec !== null && poll.ringToEndSec <= MAX_END_SEC) {
    console.log(
      `PASS: rang, then cut at ring+${poll.ringToEndSec}s (max ${MAX_END_SEC}s — before fax). Dial clock ${poll.endedAtSec}s.`
    );
    process.exit(0);
  }
  console.log(
    `FAIL: didRing=${poll.didRing} ended=${poll.ended} ring+${poll.ringToEndSec}s dial=${poll.endedAtSec}s reason=${poll.endedReason} (wanted ring+<=${MAX_END_SEC}s)`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

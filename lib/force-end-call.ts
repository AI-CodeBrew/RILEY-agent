import { hangupTwilioCall } from "@/lib/twilio";
import { getVapiCall, type VapiCall, type VapiCallStatus } from "@/lib/vapi";

function extractTwilioCallSid(call: VapiCall | null): string | null {
  if (!call) return null;
  if (typeof call.phoneCallProviderId === "string" && call.phoneCallProviderId.startsWith("CA")) {
    return call.phoneCallProviderId;
  }
  if (typeof call.twilioCallSid === "string" && call.twilioCallSid.startsWith("CA")) {
    return call.twilioCallSid;
  }
  const transport = call.transport as { callSid?: unknown } | undefined;
  if (typeof transport?.callSid === "string" && transport.callSid.startsWith("CA")) {
    return transport.callSid;
  }
  return null;
}

async function postEndCall(controlUrl: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "end-call" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteVapiCall(vapiCallId: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Ends an outbound call for real.
 *
 * Order matters: hang up the Twilio CallSid first (that actually stops the
 * PSTN leg), then tell Vapi. Vapi DELETE/control-url alone often returns 200
 * while the phone keeps ringing for ~40s into fax pickup.
 */
export async function forceEndOutboundCall({
  vapiCallId,
  controlUrl,
  twilioAccountSid,
  twilioAuthToken,
}: {
  vapiCallId: string;
  controlUrl?: string | null;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
}): Promise<{
  ended: boolean;
  status: VapiCallStatus | "unknown";
  usedTwilio: boolean;
}> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return { ended: false, status: "unknown", usedTwilio: false };
  }

  let call: VapiCall | null = null;
  try {
    call = await getVapiCall(vapiCallId);
  } catch {
    // Fall through.
  }

  if (call?.status === "ended") {
    return { ended: true, status: "ended", usedTwilio: false };
  }

  if (call?.status === "in-progress" || call?.status === "forwarding") {
    return { ended: false, status: call.status, usedTwilio: false };
  }

  let usedTwilio = false;
  let callSid = extractTwilioCallSid(call);

  // CallSid usually exists even while Vapi still says `queued`.
  if (!callSid && twilioAccountSid && twilioAuthToken) {
    for (let i = 0; i < 4 && !callSid; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        call = await getVapiCall(vapiCallId);
        if (call.status === "ended") {
          return { ended: true, status: "ended", usedTwilio: false };
        }
        if (call.status === "in-progress" || call.status === "forwarding") {
          return { ended: false, status: call.status, usedTwilio: false };
        }
        callSid = extractTwilioCallSid(call);
      } catch {
        break;
      }
    }
  }

  if (callSid && twilioAccountSid && twilioAuthToken) {
    const hangup = await hangupTwilioCall(twilioAccountSid, twilioAuthToken, callSid);
    usedTwilio = hangup.ok;
    if (!hangup.ok) {
      console.error(
        `forceEndOutboundCall: Twilio hangup failed for ${callSid}: ${hangup.status} ${hangup.body}`
      );
    }
  } else if (!callSid) {
    console.error(`forceEndOutboundCall: no Twilio CallSid yet for ${vapiCallId}`);
  } else {
    console.error(`forceEndOutboundCall: missing Twilio creds for ${vapiCallId}`);
  }

  const resolvedControlUrl = controlUrl ?? call?.monitor?.controlUrl ?? null;
  if (resolvedControlUrl) {
    await postEndCall(resolvedControlUrl);
  }
  await deleteVapiCall(vapiCallId, apiKey);

  if (usedTwilio) {
    await new Promise((r) => setTimeout(r, 400));
  }

  try {
    call = await getVapiCall(vapiCallId);
    if (call.status === "ended") {
      return { ended: true, status: "ended", usedTwilio };
    }
    const retrySid = extractTwilioCallSid(call) ?? callSid;
    if (retrySid && twilioAccountSid && twilioAuthToken) {
      const hangup = await hangupTwilioCall(twilioAccountSid, twilioAuthToken, retrySid);
      usedTwilio = usedTwilio || hangup.ok;
      await new Promise((r) => setTimeout(r, 400));
      call = await getVapiCall(vapiCallId);
      if (call.status === "ended") {
        return { ended: true, status: "ended", usedTwilio };
      }
    }
    return {
      ended: false,
      status: (call.status as VapiCallStatus | undefined) ?? "unknown",
      usedTwilio,
    };
  } catch {
    return { ended: usedTwilio, status: usedTwilio ? "ended" : "unknown", usedTwilio };
  }
}

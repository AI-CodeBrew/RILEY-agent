import { hangupTwilioCall, getTwilioCallStatus } from "@/lib/twilio";
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
 * Twilio first (PSTN truth), then sync Vapi so the assistant/session stops.
 * Pass `twilioCallSid` when known so hangup never waits on a Vapi GET.
 */
export async function forceEndOutboundCall({
  vapiCallId,
  controlUrl,
  twilioAccountSid,
  twilioAuthToken,
  twilioCallSid,
}: {
  vapiCallId: string;
  controlUrl?: string | null;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
  /** Known CallSid from ring detection — hang up immediately. */
  twilioCallSid?: string | null;
}): Promise<{
  ended: boolean;
  status: VapiCallStatus | "unknown";
  usedTwilio: boolean;
}> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return { ended: false, status: "unknown", usedTwilio: false };
  }

  let usedTwilio = false;
  let callSid =
    typeof twilioCallSid === "string" && twilioCallSid.startsWith("CA")
      ? twilioCallSid
      : null;

  // If Twilio already shows answered, do not kill a live conversation.
  if (callSid && twilioAccountSid && twilioAuthToken) {
    const tw = await getTwilioCallStatus(twilioAccountSid, twilioAuthToken, callSid);
    if (tw?.status === "in-progress") {
      return { ended: false, status: "in-progress", usedTwilio: false };
    }
    if (
      tw?.status === "completed" ||
      tw?.status === "busy" ||
      tw?.status === "failed" ||
      tw?.status === "no-answer" ||
      tw?.status === "canceled"
    ) {
      // PSTN already dead — still sync Vapi below.
      usedTwilio = true;
    } else {
      const hangup = await hangupTwilioCall(twilioAccountSid, twilioAuthToken, callSid);
      usedTwilio = hangup.ok;
      if (!hangup.ok) {
        console.error(
          `forceEndOutboundCall: Twilio hangup failed for ${callSid}: ${hangup.status} ${hangup.body}`
        );
      }
    }
  }

  let call: VapiCall | null = null;
  try {
    call = await getVapiCall(vapiCallId);
  } catch {
    // Fall through.
  }

  if (call?.status === "ended") {
    return { ended: true, status: "ended", usedTwilio };
  }

  callSid = callSid ?? extractTwilioCallSid(call);

  if (!usedTwilio && callSid && twilioAccountSid && twilioAuthToken) {
    const tw = await getTwilioCallStatus(twilioAccountSid, twilioAuthToken, callSid);
    if (tw?.status === "in-progress") {
      return { ended: false, status: "in-progress", usedTwilio: false };
    }
    const hangup = await hangupTwilioCall(twilioAccountSid, twilioAuthToken, callSid);
    usedTwilio = hangup.ok;
    if (!hangup.ok) {
      console.error(
        `forceEndOutboundCall: Twilio hangup failed for ${callSid}: ${hangup.status} ${hangup.body}`
      );
    }
  } else if (!usedTwilio && !callSid) {
    for (let i = 0; i < 3 && !callSid; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        call = await getVapiCall(vapiCallId);
        if (call.status === "ended") {
          return { ended: true, status: "ended", usedTwilio: false };
        }
        callSid = extractTwilioCallSid(call);
      } catch {
        break;
      }
    }
    if (callSid && twilioAccountSid && twilioAuthToken) {
      const hangup = await hangupTwilioCall(twilioAccountSid, twilioAuthToken, callSid);
      usedTwilio = hangup.ok;
    } else if (!callSid) {
      console.error(`forceEndOutboundCall: no Twilio CallSid yet for ${vapiCallId}`);
    } else {
      console.error(`forceEndOutboundCall: missing Twilio creds for ${vapiCallId}`);
    }
  }

  // Sync Vapi after Twilio — portal/assistant cleanup only.
  const resolvedControlUrl = controlUrl ?? call?.monitor?.controlUrl ?? null;
  if (resolvedControlUrl) {
    await postEndCall(resolvedControlUrl);
  }
  await deleteVapiCall(vapiCallId, apiKey);

  if (usedTwilio) {
    return { ended: true, status: "ended", usedTwilio: true };
  }

  try {
    call = await getVapiCall(vapiCallId);
    if (call.status === "ended") {
      return { ended: true, status: "ended", usedTwilio };
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

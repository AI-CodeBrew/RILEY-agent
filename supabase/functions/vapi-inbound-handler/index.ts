// Edge Function: vapi-inbound-handler
//
// Configured on each Vapi phone number (assistantId null + server.url).
// When someone calls an agent number inbound, Vapi sends assistant-request.
// We log the caller and reject — no AI picks up.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";

function normalizePhone(value: string | undefined | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value.startsWith("+") ? value : `+${digits}`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const message = body?.message ?? body;

    if (message?.type !== "assistant-request") {
      return jsonResponse({ received: true });
    }

    const call = message.call ?? {};
    const callerPhone =
      normalizePhone(call.customer?.number) ??
      normalizePhone(call.from?.phoneNumber) ??
      normalizePhone(call.from) ??
      "unknown";
    const calledNumber =
      normalizePhone(call.phoneNumber?.number) ??
      normalizePhone(call.phoneNumberId) ??
      "unknown";
    const callerName =
      (typeof call.customer?.name === "string" ? call.customer.name : null) ??
      (typeof call.from?.name === "string" ? call.from.name : null);
    const vapiCallId = typeof call.id === "string" ? call.id : null;
    const vapiPhoneNumberId =
      typeof call.phoneNumberId === "string" ? call.phoneNumberId : null;

    const supabase = getSupabaseAdmin();

    let agentId: string | null = null;
    if (vapiPhoneNumberId) {
      const { data: number } = await supabase
        .from("agent_phone_numbers")
        .select("agent_id")
        .eq("vapi_phone_number_id", vapiPhoneNumberId)
        .maybeSingle();
      agentId = number?.agent_id ?? null;
    }
    if (!agentId && calledNumber !== "unknown") {
      const { data: number } = await supabase
        .from("agent_phone_numbers")
        .select("agent_id")
        .eq("phone_number", calledNumber)
        .maybeSingle();
      agentId = number?.agent_id ?? null;
    }

    let repeatCount = 1;
    if (callerPhone !== "unknown") {
      let repeatQuery = supabase
        .from("inbound_calls")
        .select("id", { count: "exact", head: true })
        .eq("caller_phone", callerPhone);
      if (agentId) repeatQuery = repeatQuery.eq("agent_id", agentId);
      const { count } = await repeatQuery;
      repeatCount = (count ?? 0) + 1;
    }

    await supabase.from("inbound_calls").insert({
      agent_id: agentId,
      vapi_phone_number_id: vapiPhoneNumberId,
      called_number: calledNumber,
      caller_phone: callerPhone,
      caller_name: callerName,
      vapi_call_id: vapiCallId,
      is_repeat: repeatCount > 1,
      repeat_count: repeatCount,
      status: "rejected",
    });

    // Reject without connecting to Abby — brief message then hang up.
    return jsonResponse({
      error:
        "This line is outbound only and cannot take incoming calls. Goodbye.",
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

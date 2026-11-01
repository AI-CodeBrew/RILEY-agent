// Edge Function: mark-do-not-call
//
// Called by the Vapi assistant the moment a client asks to be removed from the
// call list. Sets customers.status so lib/trigger-call.ts and lib/campaign.ts
// refuse any further dial, and disarms any pending retry. resolveCallOutcome
// keeps this status when the call ends.
//
// Like book-appointment, this trusts only the customer id from call metadata
// (see resolveId in _shared/vapi-tool.ts).

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyVapiSecret(req)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let toolCallId: string | null = null;

  try {
    const body = await req.json();
    const parsed = parseVapiToolCall(body);
    toolCallId = parsed.toolCallId;

    const customer_id = resolveId(parsed.metadata, "customerId");
    if (!customer_id) {
      return toolError(toolCallId, "no customer on this call");
    }

    const { error } = await getSupabaseAdmin()
      .from("customers")
      .update({
        status: "do_not_call",
        next_retry_at: null,
        retry_count: 0,
        retry_campaign_id: null,
        retry_cycle_started_at: null,
      })
      .eq("id", customer_id);

    if (error) {
      console.error("mark-do-not-call: update failed", error);
      return toolError(toolCallId, "the request couldn't be saved", 500);
    }

    return toolResult(toolCallId, { removed: true });
  } catch (err) {
    console.error("mark-do-not-call failed", err);
    return toolError(toolCallId, err instanceof Error ? err.message : "could not save the request", 500);
  }
});

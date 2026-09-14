// Edge Function: log-new-rebuttal
//
// Called by the Vapi assistant right after it improvises a reply to an
// objection lookup-rebuttal didn't recognize (matched: false). Saves the
// objection + the reply just given as a new 'unreviewed' rebuttal, tagged
// with the agent whose call this is — that's who reviews it on the portal's
// Rebuttals page. No embedding is generated here; that only happens when the
// owning agent approves it (see app/api/rebuttals/[id]/route.ts).

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

    const { objection_text, answer_text } = parsed.args as {
      objection_text?: string;
      answer_text?: string;
    };
    const script = resolveId(parsed.metadata, "script");
    const agent_id = resolveId(parsed.metadata, "agentId");
    const customer_id = resolveId(parsed.metadata, "customerId");

    if (!objection_text || !answer_text) {
      return toolError(toolCallId, "objection_text and answer_text are required");
    }
    if (!script || !agent_id) {
      return toolError(
        toolCallId,
        "no agent/script on this call — rebuttal logging can only run on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();

    // Best-effort link back to the calls row for this conversation — same
    // "most recent live call for this customer/agent" lookup book-appointment
    // uses to attach outcomes to the right call.
    let source_call_id: string | null = null;
    if (customer_id) {
      const { data: activeCall } = await supabase
        .from("calls")
        .select("id")
        .eq("customer_id", customer_id)
        .eq("agent_id", agent_id)
        .in("status", ["queued", "ringing", "in_progress", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      source_call_id = activeCall?.id ?? null;
    }

    const { error } = await supabase.from("rebuttals").insert({
      script,
      agent_id,
      objection_text,
      answer_text,
      source_call_id,
      status: "unreviewed",
    });

    if (error) {
      return toolError(toolCallId, error.message, 500);
    }

    return toolResult(toolCallId, { logged: true });
  } catch (err) {
    console.error(err);
    return toolError(
      toolCallId,
      err instanceof Error ? err.message : "internal error",
      500
    );
  }
});

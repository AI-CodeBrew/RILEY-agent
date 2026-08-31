// Edge Function: lookup-rebuttal
//
// Called by the Vapi assistant when the customer raises an objection that
// isn't one of the categories already scripted in the system prompt's
// "Customer Intent & Rejection Handling" table. Embeds the objection and
// searches for the closest *approved* rebuttal in the same script — approved
// by any agent, not just whoever is on this call; see the rebuttals
// migration for why agent_id isn't part of this filter. If nothing clears
// the similarity threshold, the assistant is expected to improvise a reply
// itself and then call log-new-rebuttal with what it said.

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { verifyVapiSecret } from "../_shared/vapi-auth.ts";
import { parseVapiToolCall, resolveId, toolError, toolResult } from "../_shared/vapi-tool.ts";
import { embedText } from "../_shared/embeddings.ts";

// Cosine distance (embedding <=> embedding, 0 = identical, 2 = opposite) —
// tune this after watching real match/miss behavior in practice.
const MAX_MATCH_DISTANCE = 0.25;

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

    const { objection_text } = parsed.args as { objection_text?: string };
    const script = resolveId(parsed.metadata, "script");

    if (!objection_text) {
      return toolError(toolCallId, "objection_text is required");
    }
    if (!script) {
      return toolError(
        toolCallId,
        "no script on this call — rebuttal lookup can only run on a call placed from the portal"
      );
    }

    const supabase = getSupabaseAdmin();
    const embedding = await embedText(objection_text);

    const { data: matches, error } = await supabase.rpc("match_rebuttal", {
      p_script: script,
      p_embedding: embedding,
      p_match_count: 1,
    });

    if (error) {
      return toolError(toolCallId, error.message, 500);
    }

    const best = (matches as { id: string; answer_text: string; distance: number }[] | null)?.[0];

    if (!best || best.distance > MAX_MATCH_DISTANCE) {
      return toolResult(toolCallId, { matched: false });
    }

    // Best-effort usage counter — never worth failing the lookup over.
    try {
      await supabase.rpc("increment_rebuttal_match", { p_id: best.id });
    } catch (err) {
      console.warn("lookup-rebuttal: could not bump times_matched", err);
    }

    return toolResult(toolCallId, { matched: true, answer_text: best.answer_text });
  } catch (err) {
    console.error(err);
    return toolError(
      toolCallId,
      err instanceof Error ? err.message : "internal error",
      500
    );
  }
});

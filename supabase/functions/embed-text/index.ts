// Edge Function: embed-text
//
// Supabase.ai (the gte-small embedding model) only runs inside the Edge
// Functions Deno runtime — it isn't something Next.js server code can call
// directly. This function exists purely so lib/embeddings.ts (used by
// app/api/rebuttals/[id]/route.ts when an agent approves a rebuttal) can get
// an embedding without a second external provider. No custom auth here: this
// keeps the platform's default verify_jwt = true (see supabase/config.toml,
// which only lists the Vapi-facing functions as false), and is only ever
// called server-side with the service role key — see lib/embeddings.ts.

import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { embedText } from "../_shared/embeddings.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return jsonResponse({ error: "text is required" }, 400);
    }

    const embedding = await embedText(text);
    return jsonResponse({ embedding });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "internal error" },
      500
    );
  }
});

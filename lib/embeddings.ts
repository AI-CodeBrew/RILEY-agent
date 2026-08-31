import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Embeds text via the embed-text Edge Function, which runs Supabase's
 * built-in Supabase.ai (gte-small) inference — no external provider or API
 * key required. Used by app/api/rebuttals/[id]/route.ts when an agent
 * approves a rebuttal, so it becomes matchable by lookup-rebuttal (which
 * embeds the same way, directly in its own Edge Function).
 */
export async function embedText(text: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin.functions.invoke("embed-text", {
    body: { text },
  });

  if (error) {
    throw new Error(`embed-text failed: ${error.message}`);
  }
  if (!Array.isArray(data?.embedding)) {
    throw new Error("embed-text response missing embedding");
  }

  return data.embedding as number[];
}

// Embeddings via Supabase Edge Functions' built-in AI inference
// (Supabase.ai, gte-small — 384 dimensions) rather than an external
// provider: no OPENAI_API_KEY or any other secret to provision, since it
// runs locally in the Edge Function's own Deno runtime. Used by
// lookup-rebuttal to embed an incoming objection at query time. (Embedding
// an *approved* rebuttal's objection_text happens on the Next.js side via
// the embed-text function, since Supabase.ai only exists inside the Edge
// Functions runtime — see lib/embeddings.ts.)
//
// First call per cold function instance pays a model-load cost — Vapi is
// waiting on the phone for lookup-rebuttal's response, so this is worth
// knowing about if that turn ever feels slow to answer.

// deno-lint-ignore no-explicit-any
declare const Supabase: any;

const session = new Supabase.ai.Session("gte-small");

export async function embedText(text: string): Promise<number[]> {
  return await session.run(text, { mean_pool: true, normalize: true });
}

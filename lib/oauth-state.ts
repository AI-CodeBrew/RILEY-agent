import { supabaseAdmin } from "@/lib/supabase-admin";

const STATE_TTL_MS = 10 * 60_000;

/**
 * Issues a one-time, short-lived CSRF token for the Zoom OAuth redirect.
 * Zoom's callback has no session of its own to trust (it's a redirect from
 * Zoom, not a fetch from our own app), so this `state` value is the only
 * thing tying that callback back to a specific agent.
 */
export async function createOAuthState(
  agentId: string,
  provider: "zoom"
): Promise<string> {
  const state = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("oauth_states").insert({
    agent_id: agentId,
    provider,
    state,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Could not create OAuth state: ${error.message}`);
  return state;
}

/**
 * Validates and immediately deletes a state value — single-use, so a
 * replayed callback (or someone guessing/reusing an old URL) can't consume
 * it twice. Returns the agent it was issued for, or null if it's missing,
 * expired, or already used.
 */
export async function consumeOAuthState(
  state: string,
  provider: "zoom"
): Promise<{ agentId: string } | null> {
  const { data } = await supabaseAdmin
    .from("oauth_states")
    .select("id, agent_id, expires_at")
    .eq("state", state)
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return null;

  await supabaseAdmin.from("oauth_states").delete().eq("id", data.id);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return { agentId: data.agent_id };
}

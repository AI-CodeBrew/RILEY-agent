import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Shared by both mutation routes below and invalidated via this tag, so the
 * count is exact the moment a number is actually connected/disconnected —
 * not stale, just no longer re-queried on every portal navigation in
 * between. `revalidate` is a defensive fallback only, in case some future
 * write path to agent_phone_numbers forgets to invalidate the tag.
 */
export const AGENT_PHONE_NUMBER_COUNT_TAG = "agent-phone-numbers";

export const getAgentPhoneNumberCount = unstable_cache(
  async (agentId: string): Promise<number> => {
    const { count } = await supabaseAdmin
      .from("agent_phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId);
    return count ?? 0;
  },
  ["agent-phone-number-count"],
  { tags: [AGENT_PHONE_NUMBER_COUNT_TAG], revalidate: 300 }
);

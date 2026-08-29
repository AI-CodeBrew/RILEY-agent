import { supabaseAdmin } from "@/lib/supabase-admin";

export type DirectoryAgent = { id: string; name: string; email: string };

/** Every active, approved teammate (agents and admins) — for the forum's author list and the inbox's "message someone" picker. Not scoped by role: unlike customer data, staff discussion is shared across the whole account. */
export async function getAgentDirectory(excludeAgentId?: string): Promise<DirectoryAgent[]> {
  let query = supabaseAdmin
    .from("sales_agents")
    .select("id, name, email")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .order("name", { ascending: true });

  if (excludeAgentId) query = query.neq("id", excludeAgentId);

  const { data } = await query;
  return data ?? [];
}

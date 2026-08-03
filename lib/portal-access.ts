import { supabaseAdmin } from "@/lib/supabase-admin";

/** True when this auth user has an approved, active sales_agents row. */
export async function hasPortalAccess(authUserId: string): Promise<boolean> {
  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("id, is_active, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return Boolean(
    agent && agent.is_active && agent.approval_status === "approved"
  );
}

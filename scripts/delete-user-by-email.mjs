/**
 * Permanently removes a portal user by email:
 *   1. sales_agents row (customers/calls/appointments keep history; agent_id → null)
 *   2. Supabase Auth user (so the email can sign up again)
 *
 * Usage:
 *   node --env-file=.env.local scripts/delete-user-by-email.mjs uzrhsn375@gmail.com
 *   node --env-file=.env.local scripts/delete-user-by-email.mjs uzrhsn375@gmail.com --dry
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const dryRun = process.argv.includes("--dry");

if (!email || email.startsWith("-")) {
  console.error("Usage: node --env-file=.env.local scripts/delete-user-by-email.mjs <email> [--dry]");
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: agent, error: agentError } = await supabase
  .from("sales_agents")
  .select("id, name, email, role, auth_user_id, is_active, approval_status")
  .ilike("email", email)
  .maybeSingle();

if (agentError) {
  console.error("Lookup failed:", agentError.message);
  process.exit(1);
}

let authUserId = agent?.auth_user_id ?? null;

if (!authUserId) {
  // Orphan auth user (signup without sales_agents row, or row already deleted).
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    console.error("Auth list failed:", listError.message);
    process.exit(1);
  }
  const authUser = (listed.users ?? []).find(
    (user) => user.email?.toLowerCase() === email
  );
  authUserId = authUser?.id ?? null;
}

if (!agent && !authUserId) {
  console.log(`No sales_agents row or auth user found for ${email}.`);
  process.exit(0);
}

console.log(
  dryRun ? "[dry run] Would delete:" : "Deleting:",
  JSON.stringify(
    {
      email,
      agent: agent
        ? { id: agent.id, name: agent.name, role: agent.role, approval_status: agent.approval_status }
        : null,
      auth_user_id: authUserId,
    },
    null,
    2
  )
);

if (dryRun) {
  process.exit(0);
}

if (agent) {
  if (agent.role === "admin") {
    const { count } = await supabase
      .from("sales_agents")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      console.error("Refusing to delete the only active admin. Promote another admin first.");
      process.exit(1);
    }
  }

  const { error: deleteAgentError } = await supabase
    .from("sales_agents")
    .delete()
    .eq("id", agent.id);

  if (deleteAgentError) {
    console.error("Failed to delete sales_agents row:", deleteAgentError.message);
    process.exit(1);
  }
  console.log(`Removed sales_agents row for ${agent.name} (${agent.id}).`);
}

if (authUserId) {
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUserId);
  if (deleteAuthError) {
    console.error("Failed to delete auth user:", deleteAuthError.message);
    process.exit(1);
  }
  console.log(`Removed auth user ${authUserId}.`);
}

console.log("Done. Email can be used to register again.");

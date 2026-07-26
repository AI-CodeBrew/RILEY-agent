/**
 * Bootstraps the first admin login — the one account that can then create
 * every other agent from the portal's Sales Agents page.
 *
 *   npm run create-admin -- --email you@company.com --password "s3cret!" --name "Your Name"
 *
 * Safe to re-run: an existing Supabase user with that email is reused and
 * relinked, and an existing sales_agents row is promoted to admin.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = arg("email");
const password = arg("password");
const name = arg("name") ?? email?.split("@")[0];

if (!email || !password) {
  console.error(
    'Usage: npm run create-admin -- --email you@company.com --password "s3cret!" [--name "Your Name"]'
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run through `npm run create-admin` so .env.local is loaded."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name },
});

let userId = created?.user?.id;

if (createError) {
  // Already registered — find them and reset the password to what was passed.
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
  if (!existing) {
    console.error("Could not create or find that user:", createError.message);
    process.exit(1);
  }
  userId = existing.id;
  await supabase.auth.admin.updateUserById(userId, { password });
  console.log(`Reused existing Supabase user ${email} and reset the password.`);
}

const { data: agent, error: agentError } = await supabase
  .from("sales_agents")
  .upsert(
    { name, email, role: "admin", is_active: true, auth_user_id: userId },
    { onConflict: "email" }
  )
  .select("id, name, email, role")
  .single();

if (agentError) {
  console.error("Created the login, but linking the sales_agents row failed:", agentError.message);
  process.exit(1);
}

console.log(`Admin ready: ${agent.name} <${agent.email}> (${agent.id})`);
console.log("Sign in at /login.");

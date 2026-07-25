import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-only Supabase client using the service role key.
 *
 * There's no auth/RLS-per-user model yet (single-tenant internal tool), so
 * every read/write goes through this client from trusted server code only:
 * Server Components, Route Handlers (app/api/**), and Server Actions.
 *
 * Never import this file from a Client Component — the service role key
 * must not reach the browser.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase-admin.ts must never be imported in browser/client code."
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

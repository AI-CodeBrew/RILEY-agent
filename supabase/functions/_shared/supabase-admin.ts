import { createClient } from "jsr:@supabase/supabase-js@2";

// Edge Functions get SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY injected
// automatically by the Supabase platform — no need to set them manually
// in `supabase secrets`.
export function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

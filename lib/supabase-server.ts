import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Supabase client bound to the signed-in agent's session cookies. Used only
 * for auth (sign-in/out, "who am I") — all data reads/writes still go through
 * lib/supabase-admin.ts with the service role key, scoped in lib/auth.ts.
 *
 * Server Components can't set cookies, so writes from a render pass are
 * swallowed; the session is refreshed in proxy.ts instead, which can.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — proxy.ts keeps the session fresh.
          }
        },
      },
    }
  );
}

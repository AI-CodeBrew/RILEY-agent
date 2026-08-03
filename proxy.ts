import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasPortalAccess } from "@/lib/portal-access";

const PUBLIC_PATHS = ["/login", "/register", "/auth"];

/**
 * Two jobs, both of which have to happen before a route renders:
 *   1. Refresh the Supabase session cookie (Server Components can't write
 *      cookies, so this is the only place the rotated refresh token lands).
 *   2. Bounce anonymous requests to /login — an optimistic check only; the
 *      real authorization lives in lib/auth.ts next to the data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Expired or revoked refresh token in cookies — clear session instead of
  // spamming the console on every request.
  if (authError) {
    await supabase.auth.signOut();
  }

  const signedIn = authError ? null : user;

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!signedIn && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Come back to whatever they were reaching for after signing in.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && (pathname === "/login" || pathname === "/register")) {
    const canEnterPortal = await hasPortalAccess(signedIn.id);
    if (canEnterPortal) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
    // Stale or unapproved auth — let them stay on login/register (requireSession
    // clears the cookie if they hit a portal route directly).
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the webhook-facing API surface —
     * API routes do their own auth via requireApiSession().
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

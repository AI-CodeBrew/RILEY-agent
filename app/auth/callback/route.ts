import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_CANADA_TIMEZONE } from "@/lib/canada-timezones";

/**
 * Where Supabase sends the browser back after Google OAuth. Exchanges the
 * code for a session, then makes sure a sales_agents row is attached to it —
 * mirroring /api/auth/register's provisioning so a first-time Google sign-in
 * lands exactly where a first-time email/password signup would: pending,
 * waiting on an admin.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") ? next : "/dashboard";

  const loginUrl = new URL("/login", url.origin);

  if (!code) {
    console.error("[auth/callback] no code param on the request");
    loginUrl.searchParams.set("error", "Google sign-in didn't complete. Try again.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error);
    loginUrl.searchParams.set(
      "error",
      process.env.NODE_ENV === "production"
        ? "Google sign-in didn't complete. Try again."
        : `Google sign-in didn't complete: ${error?.message ?? "no user returned"}`
    );
    return NextResponse.redirect(loginUrl);
  }

  const user = data.user;
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "Your Google account has no email — sign in with email and password instead.");
    return NextResponse.redirect(loginUrl);
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("id, auth_user_id, is_active, approval_status, rejection_reason")
    .eq("email", email)
    .maybeSingle();

  if (!agent) {
    // First time anyone's seen this email — same starting state as a
    // self-registered agent: pending until an admin approves them.
    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      email;

    const { error: insertError } = await supabaseAdmin.from("sales_agents").insert({
      name,
      email,
      role: "agent",
      approval_status: "pending",
      is_active: true,
      auth_user_id: user.id,
      timezone: DEFAULT_CANADA_TIMEZONE,
    });

    if (insertError) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "Could not complete sign-in. Try again.");
      return NextResponse.redirect(loginUrl);
    }
  } else if (!agent.auth_user_id) {
    // A row seeded (or approved) by an admin before this person ever logged
    // in. Google already verified the email, unlike a typed-in signup
    // password, so — unlike register.ts's claim path — this doesn't need to
    // be knocked back to pending.
    await supabaseAdmin
      .from("sales_agents")
      .update({ auth_user_id: user.id })
      .eq("id", agent.id);
  } else if (agent.auth_user_id !== user.id) {
    // Row already linked to a different auth user — shouldn't happen since
    // Supabase links by verified email, but don't silently take over someone
    // else's account if it does.
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "This email is already linked to a different sign-in method.");
    return NextResponse.redirect(loginUrl);
  }

  const { data: finalAgent } = await supabaseAdmin
    .from("sales_agents")
    .select("is_active, approval_status, rejection_reason")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const blocked = (() => {
    if (!finalAgent) return "This login isn't linked to a sales agent yet.";
    if (finalAgent.approval_status === "pending") {
      return "Your account is waiting for admin approval. You'll be able to sign in once it's approved.";
    }
    if (finalAgent.approval_status === "rejected") {
      return finalAgent.rejection_reason
        ? `Your registration was declined: ${finalAgent.rejection_reason}`
        : "Your registration was declined. Contact your admin if you think that's a mistake.";
    }
    if (!finalAgent.is_active) {
      return "This account has been deactivated. Ask your admin to reactivate it.";
    }
    return null;
  })();

  if (blocked) {
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", blocked);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}

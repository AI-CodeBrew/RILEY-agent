import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Signs in through the server client so the session cookies are written by
 * the response (not by JS), and refuses anyone whose Supabase user isn't
 * attached to an active sales_agents row — a login with no agent record
 * would otherwise sit in a redirect loop against the portal layout.
 */
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("id, is_active, approval_status, rejection_reason")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  // The password was right, so anything below is a state problem, not a
  // credentials problem — say which one it is rather than a flat "denied".
  const blocked = (() => {
    if (!agent) return "This login isn't linked to a sales agent yet.";
    if (agent.approval_status === "pending") {
      return "Your account is waiting for admin approval. You'll be able to sign in once it's approved.";
    }
    if (agent.approval_status === "rejected") {
      return agent.rejection_reason
        ? `Your registration was declined: ${agent.rejection_reason}`
        : "Your registration was declined. Contact your admin if you think that's a mistake.";
    }
    if (!agent.is_active) {
      return "This account has been deactivated. Ask your admin to reactivate it.";
    }
    return null;
  })();

  if (blocked) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: blocked }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}

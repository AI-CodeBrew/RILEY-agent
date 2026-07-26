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
    .select("id, is_active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!agent || !agent.is_active) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          "This login isn't linked to an active sales agent. Ask your admin to reactivate it.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}

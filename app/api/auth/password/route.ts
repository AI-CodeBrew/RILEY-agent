import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireApiSession } from "@/lib/auth";

/** Lets a signed-in agent change their own password from /settings. */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { current_password, new_password } = await request.json().catch(() => ({}));

  if (!new_password || new_password.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  // Re-authenticate first: a stolen session shouldn't be enough to lock the
  // real agent out of their own account.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: auth.session.agent.email,
    password: current_password ?? "",
  });
  if (reauthError) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

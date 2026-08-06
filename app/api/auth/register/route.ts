import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  parseCanadaTimezoneInput,
} from "@/lib/canada-timezones";

/**
 * Public sales-agent signup. Creates the Supabase Auth user and a matching
 * sales_agents row parked at `approval_status: 'pending'` — the login exists
 * but won't get past /api/auth/login until an admin approves it from the
 * Sales Agents tab. Nothing here can mint an admin: the role is hard-coded.
 *
 * Deliberately no session is issued, so a signup can't be used to probe the
 * portal while it waits.
 */
export async function POST(request: Request) {
  const { name, email, password, phone, timezone } = await request
    .json()
    .catch(() => ({}));

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, work email and a password are required." },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const agentTimezone = parseCanadaTimezoneInput(timezone);
  if (agentTimezone === "invalid") {
    return NextResponse.json(
      { error: "Time zone must be Atlantic, Eastern, Mountain, or Pacific." },
      { status: 400 }
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Registration is unauthenticated, so the response must not reveal whether
  // an address is already in use — same 202 either way, and the real state is
  // whatever the existing row already says.
  const accepted = NextResponse.json(
    {
      ok: true,
      message:
        "Registration received. An admin has to approve your account before you can sign in.",
    },
    { status: 202 }
  );

  const { data: existing } = await supabaseAdmin
    .from("sales_agents")
    .select("id, auth_user_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  // An agent row with no auth user is a record seeded before logins existed.
  // Without this branch that person could never get in: registration would
  // bounce off the duplicate-email check forever.
  if (existing && !existing.auth_user_id) {
    const { data: claimed, error: claimError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

    if (claimError || !claimed.user) return accepted;

    // Back to 'pending' on purpose. Nothing here proves the person filling in
    // the form owns that address, so an admin still has to vouch for them.
    await supabaseAdmin
      .from("sales_agents")
      .update({
        auth_user_id: claimed.user.id,
        approval_status: "pending",
        rejection_reason: null,
        phone: phone || null,
        timezone: agentTimezone,
      })
      .eq("id", existing.id);

    return accepted;
  }

  if (existing) return accepted;

  const { data: created, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (authError || !created.user) {
    // Almost always "email already registered" — an auth user with no agent
    // row behind it. Same opaque response.
    return accepted;
  }

  const { error } = await supabaseAdmin.from("sales_agents").insert({
    name,
    email: normalizedEmail,
    role: "agent",
    approval_status: "pending",
    is_active: true,
    auth_user_id: created.user.id,
    phone: phone || null,
    timezone: agentTimezone,
  });

  if (error) {
    // Don't leave a login floating with no agent record behind it — it would
    // be unapprovable and invisible in the admin queue.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Could not complete registration. Try again." },
      { status: 500 }
    );
  }

  return accepted;
}

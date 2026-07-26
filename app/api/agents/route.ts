import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";
import { requireApiSession } from "@/lib/auth";

const AGENT_COLUMNS =
  "id, name, email, role, is_active, phone, timezone, calendly_url, calendly_user_uri, vapi_phone_number, vapi_phone_number_id, auth_user_id, created_at";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  // Agents only ever need to see themselves (assignment dropdowns, filters).
  const query = supabaseAdmin
    .from("sales_agents")
    .select(AGENT_COLUMNS)
    .order("created_at", { ascending: false });

  const { data, error } = auth.session.isAdmin
    ? await query
    : await query.eq("id", auth.session.agent.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agents: data });
}

/**
 * Creates a sales agent *and* their portal login in one step: a Supabase Auth
 * user (so they can sign in at /login) linked to the sales_agents row that
 * scopes everything they can see.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const {
    name,
    email,
    password,
    role,
    calendly_url,
    calendly_access_token,
    timezone,
  } = body ?? {};

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "name, email and a starting password are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Validate the Calendly PAT (if provided), resolve the agent's Calendly
  // user URI, and subscribe to booking-confirmation webhooks up front so
  // book-appointment and calendly-webhook-handler don't have to do it per-call.
  let calendlyFields = {
    calendly_user_uri: null as string | null,
    calendly_webhook_uri: null as string | null,
    calendly_webhook_signing_key: null as string | null,
  };
  if (calendly_access_token) {
    try {
      calendlyFields = await connectAgentCalendly(calendly_access_token);
    } catch {
      return NextResponse.json(
        { error: "Calendly token is invalid (failed to fetch /users/me)" },
        { status: 400 }
      );
    }
  }

  const { data: created, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (authError || !created.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Could not create the login for this agent." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .insert({
      name,
      email,
      role: role === "admin" ? "admin" : "agent",
      auth_user_id: created.user.id,
      timezone: timezone || "America/New_York",
      calendly_url: calendly_url || null,
      calendly_access_token: calendly_access_token || null,
      ...calendlyFields,
    })
    .select(AGENT_COLUMNS)
    .single();

  if (error) {
    // Don't leave a login floating with no agent record behind it.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}

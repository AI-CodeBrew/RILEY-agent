import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";
import { requireApiSession } from "@/lib/auth";
import type { SalesAgent } from "@/types/database";

const AGENT_COLUMNS =
  "id, name, email, role, is_active, phone, timezone, calendly_url, calendly_user_uri, vapi_phone_number, vapi_phone_number_id, auth_user_id, created_at";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const isSelf = id === auth.session.agent.id;

  // Agents manage their own profile and Calendly connection; role,
  // activation and password resets for anyone else are admin-only.
  if (!isSelf && !auth.session.isAdmin) {
    return NextResponse.json(
      { error: "you can only edit your own profile" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const {
    name,
    email,
    phone,
    timezone,
    calendly_url,
    calendly_access_token,
    role,
    is_active,
    password,
  } = body ?? {};

  const updates: Partial<SalesAgent> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone || null;
  if (timezone !== undefined) updates.timezone = timezone;
  if (calendly_url !== undefined) updates.calendly_url = calendly_url || null;

  if (role !== undefined || is_active !== undefined) {
    if (!auth.session.isAdmin) {
      return NextResponse.json(
        { error: "only admins can change roles or deactivate agents" },
        { status: 403 }
      );
    }
    if (role !== undefined) updates.role = role === "admin" ? "admin" : "agent";
    if (is_active !== undefined) {
      // Locking yourself out of the only admin account is unrecoverable
      // from the UI, so refuse it here.
      if (isSelf && is_active === false) {
        return NextResponse.json(
          { error: "you can't deactivate your own account" },
          { status: 400 }
        );
      }
      updates.is_active = Boolean(is_active);
    }
  }

  const { data: existing } = await supabaseAdmin
    .from("sales_agents")
    .select("auth_user_id, calendly_webhook_uri")
    .eq("id", id)
    .single();

  if (calendly_access_token) {
    try {
      const calendlyFields = await connectAgentCalendly(
        calendly_access_token,
        // Deleting the old subscription needs the token it was created
        // with — reuse the previous one if it's still on file.
        existing?.calendly_webhook_uri
      );
      updates.calendly_access_token = calendly_access_token;
      Object.assign(updates, calendlyFields);
    } catch {
      return NextResponse.json(
        { error: "Calendly token is invalid (failed to fetch /users/me)" },
        { status: 400 }
      );
    }
  }

  // Email and password live on the Supabase Auth user, not on our row.
  if (email !== undefined || password !== undefined) {
    if (!auth.session.isAdmin && !isSelf) {
      return NextResponse.json({ error: "not allowed" }, { status: 403 });
    }
    if (password !== undefined && password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (existing?.auth_user_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        existing.auth_user_id,
        {
          ...(email !== undefined ? { email } : {}),
          ...(password !== undefined ? { password } : {}),
        }
      );
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }
    if (email !== undefined) updates.email = email;
  }

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update(updates)
    .eq("id", id)
    .select(AGENT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data });
}

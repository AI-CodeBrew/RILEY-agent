import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";
import { requireApiSession } from "@/lib/auth";
import type { SalesAgent } from "@/types/database";

const AGENT_COLUMNS =
  "id, name, email, role, is_active, approval_status, approved_at, rejection_reason, phone, timezone, calendly_url, calendly_user_uri, vapi_phone_number, vapi_phone_number_id, auth_user_id, created_at";

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
    approval_status,
    rejection_reason,
    password,
  } = body ?? {};

  const updates: Partial<SalesAgent> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone || null;
  if (timezone !== undefined) updates.timezone = timezone;

  // Calendly belongs to the agent who books on it. Admins are read-only over
  // the account and have no calendar of their own, so they can't wire up (or
  // silently repoint) somebody else's connection.
  if (calendly_url !== undefined || calendly_access_token !== undefined) {
    if (!isSelf) {
      return NextResponse.json(
        { error: "agents connect their own Calendly from Settings" },
        { status: 403 }
      );
    }
    if (calendly_url !== undefined) updates.calendly_url = calendly_url || null;
  }

  // Approving a pending registration is the admin's half of the signup flow.
  if (approval_status !== undefined) {
    if (!auth.session.isAdmin) {
      return NextResponse.json(
        { error: "only admins can approve or reject registrations" },
        { status: 403 }
      );
    }
    if (approval_status !== "approved" && approval_status !== "rejected") {
      return NextResponse.json(
        { error: "approval_status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }
    updates.approval_status = approval_status;
    updates.approved_at = new Date().toISOString();
    updates.approved_by = auth.session.agent.id;
    updates.rejection_reason =
      approval_status === "rejected" ? rejection_reason || null : null;
  }

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
    .select("auth_user_id, email, name, calendly_webhook_uri")
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
    } else if (password !== undefined) {
      // No auth user behind this row — a record seeded before logins existed.
      // Setting a password on it means "give this person a login", so create
      // one and link it. Previously this branch silently did nothing and
      // still reported success, so the agent stayed unable to sign in.
      const loginEmail = email ?? existing?.email;
      if (!loginEmail) {
        return NextResponse.json(
          { error: "this agent has no email to create a login with" },
          { status: 400 }
        );
      }

      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: { name: name ?? existing?.name },
        });

      if (createError || !created.user) {
        return NextResponse.json(
          {
            error:
              createError?.message ?? "Could not create a login for this agent.",
          },
          { status: 400 }
        );
      }

      updates.auth_user_id = created.user.id;
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

/**
 * Removes an agent for good — the sales_agents row and the Supabase Auth user
 * behind it. Their customers, calls and appointments survive: the FKs are
 * `on delete set null`, so the history stays readable and the customers land
 * back in the unassigned pile for someone else to pick up.
 *
 * Deactivating is the reversible option; this one isn't, so it's admin-only
 * and refuses the caller's own account.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (id === auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can't delete your own account" },
      { status: 400 }
    );
  }

  const { data: agent } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name, role, auth_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  // Deleting the last admin would leave nobody able to approve registrations.
  if (agent.role === "admin") {
    const { count } = await supabaseAdmin
      .from("sales_agents")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "this is the only admin — promote someone else first" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("sales_agents")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Row is gone; drop the login too so the email can be reused. A failure
  // here leaves an orphaned auth user, which is harmless — login refuses
  // anyone without a sales_agents row.
  if (agent.auth_user_id) {
    await supabaseAdmin.auth.admin.deleteUser(agent.auth_user_id);
  }

  return NextResponse.json({ ok: true, deleted: agent.name });
}

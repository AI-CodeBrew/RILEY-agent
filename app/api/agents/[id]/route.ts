import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";
import { parseCanadaTimezoneInput } from "@/lib/canada-timezones";
import { requireApiSession } from "@/lib/auth";
import type { SalesAgent } from "@/types/database";

const AGENT_COLUMNS =
  "id, name, email, role, is_active, approval_status, approved_at, rejection_reason, phone, timezone, calendly_url, calendly_user_uri, vapi_phone_number, vapi_phone_number_id, auth_user_id, default_voice_gender, default_script, retry_delay_minutes, retry_max_attempts, retry_window_start, retry_window_end, created_at";

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
    default_voice_gender,
    default_script,
    retry_delay_minutes,
    retry_max_attempts,
    retry_window_start,
    retry_window_end,
  } = body ?? {};

  const updates: Partial<SalesAgent> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone || null;
  if (timezone !== undefined) {
    const parsed = parseCanadaTimezoneInput(timezone);
    if (parsed === "invalid") {
      return NextResponse.json(
        { error: "Time zone must be Atlantic, Eastern, Mountain, or Pacific." },
        { status: 400 }
      );
    }
    updates.timezone = parsed;
  }

  // AI Integration prefs are personal, like Calendly — an agent sets their
  // own, admins don't set them on someone else's behalf.
  if (default_voice_gender !== undefined) {
    if (!isSelf) {
      return NextResponse.json(
        { error: "agents set their own AI Integration prefs" },
        { status: 403 }
      );
    }
    if (
      default_voice_gender !== null &&
      default_voice_gender !== "male" &&
      default_voice_gender !== "female"
    ) {
      return NextResponse.json(
        { error: 'default_voice_gender must be "male", "female", or null' },
        { status: 400 }
      );
    }
    updates.default_voice_gender = default_voice_gender;
  }
  if (default_script !== undefined) {
    if (!isSelf) {
      return NextResponse.json(
        { error: "agents set their own AI Integration prefs" },
        { status: 403 }
      );
    }
    if (
      default_script !== null &&
      default_script !== "POS" &&
      default_script !== "UNION" &&
      default_script !== "WILL_KIT"
    ) {
      return NextResponse.json(
        { error: 'default_script must be "POS", "UNION", "WILL_KIT", or null' },
        { status: 400 }
      );
    }
    updates.default_script = default_script;
  }

  // How long to wait before auto-redialing a follow_up/no_answer customer is
  // the agent's own call cadence, not a policy admins impose — same bucket
  // as voice/script. Calling *hours* and the attempt cap stay admin-only
  // below since those are the org-wide guardrails.
  if (retry_delay_minutes !== undefined) {
    if (!isSelf) {
      return NextResponse.json(
        { error: "agents set their own auto-retry delay" },
        { status: 403 }
      );
    }
    if (!Number.isFinite(retry_delay_minutes) || retry_delay_minutes <= 0) {
      return NextResponse.json(
        { error: "retry_delay_minutes must be a positive number" },
        { status: 400 }
      );
    }
    updates.retry_delay_minutes = retry_delay_minutes;
  }

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

  // Auto-retry calling *hours* and the attempt cap are the admin's call,
  // same as role/is_active — an agent shouldn't be able to widen their own
  // dialing window or attempt limit. (The delay itself is handled above —
  // that's the agent's own call cadence.)
  if (
    retry_max_attempts !== undefined ||
    retry_window_start !== undefined ||
    retry_window_end !== undefined
  ) {
    if (!auth.session.isAdmin) {
      return NextResponse.json(
        { error: "only admins can change auto-retry calling hours or attempt cap" },
        { status: 403 }
      );
    }
    if (retry_max_attempts !== undefined) {
      if (!Number.isFinite(retry_max_attempts) || retry_max_attempts < 0) {
        return NextResponse.json(
          { error: "retry_max_attempts must be zero or a positive number" },
          { status: 400 }
        );
      }
      updates.retry_max_attempts = retry_max_attempts;
    }
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    if (retry_window_start !== undefined) {
      if (typeof retry_window_start !== "string" || !timePattern.test(retry_window_start)) {
        return NextResponse.json(
          { error: "retry_window_start must be an HH:MM time" },
          { status: 400 }
        );
      }
      updates.retry_window_start = retry_window_start;
    }
    if (retry_window_end !== undefined) {
      if (typeof retry_window_end !== "string" || !timePattern.test(retry_window_end)) {
        return NextResponse.json(
          { error: "retry_window_end must be an HH:MM time" },
          { status: 400 }
        );
      }
      updates.retry_window_end = retry_window_end;
    }
    const nextStart = updates.retry_window_start ?? undefined;
    const nextEnd = updates.retry_window_end ?? undefined;
    if (nextStart !== undefined && nextEnd !== undefined && nextEnd <= nextStart) {
      return NextResponse.json(
        { error: "retry_window_end must be after retry_window_start" },
        { status: 400 }
      );
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("sales_agents")
    .select("auth_user_id, email, name, calendly_webhook_uri, default_voice_gender, default_script")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

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
    const nextPassword =
      typeof password === "string" && password.trim().length > 0
        ? password.trim()
        : undefined;
    if (nextPassword !== undefined && nextPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (existing.auth_user_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        existing.auth_user_id,
        {
          ...(email !== undefined ? { email } : {}),
          ...(nextPassword !== undefined ? { password: nextPassword } : {}),
        }
      );
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else if (nextPassword !== undefined) {
      // No auth user behind this row — a record seeded before logins existed.
      // Setting a password on it means "give this person a login", so create
      // one and link it. Previously this branch silently did nothing and
      // still reported success, so the agent stayed unable to sign in.
      const loginEmail = email ?? existing.email;
      if (!loginEmail) {
        return NextResponse.json(
          { error: "this agent has no email to create a login with" },
          { status: 400 }
        );
      }

      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: loginEmail,
          password: nextPassword,
          email_confirm: true,
          user_metadata: { name: name ?? existing.name },
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

  // Password-only resets touch Supabase Auth but may leave `updates` empty —
  // an empty .update() returns no row and .single() throws.
  if (Object.keys(updates).length === 0) {
    const { data, error: fetchError } = await supabaseAdmin
      .from("sales_agents")
      .select(AGENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !data) {
      return NextResponse.json(
        { error: fetchError?.message ?? "agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ agent: data });
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

  // Log AI Integration changes for the page's history list. Best-effort —
  // the agent record already saved, so a logging failure shouldn't surface
  // as a save error.
  const historyRows: { agent_id: string; field: "voice_gender" | "script"; old_value: string | null; new_value: string | null }[] = [];
  if (
    "default_voice_gender" in updates &&
    updates.default_voice_gender !== existing.default_voice_gender
  ) {
    historyRows.push({
      agent_id: id,
      field: "voice_gender",
      old_value: existing.default_voice_gender,
      new_value: updates.default_voice_gender ?? null,
    });
  }
  if ("default_script" in updates && updates.default_script !== existing.default_script) {
    historyRows.push({
      agent_id: id,
      field: "script",
      old_value: existing.default_script,
      new_value: updates.default_script ?? null,
    });
  }
  if (historyRows.length > 0) {
    await supabaseAdmin.from("agent_ai_preference_changes").insert(historyRows);
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

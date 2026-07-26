import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

const AGENT_COLUMNS =
  "id, name, email, role, is_active, approval_status, approved_at, rejection_reason, phone, timezone, calendly_url, calendly_user_uri, vapi_phone_number, vapi_phone_number_id, auth_user_id, created_at";

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

// There is no POST here on purpose. Agents register themselves at /register
// and land in the admin's approval queue — see app/api/auth/register/route.ts.
// Admins approve or reject via PATCH /api/agents/[id].

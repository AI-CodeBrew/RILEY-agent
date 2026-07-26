import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { toE164 } from "@/lib/format";

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const requestedAgentId =
    new URL(request.url).searchParams.get("agent") ?? undefined;

  const query = applyAgentScope(
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name, email)")
      .order("created_at", { ascending: false }),
    auth.session,
    { requestedAgentId }
  );

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data });
}

export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { name, phone, email, company, notes, agent_id } = body ?? {};

  if (!name || !phone) {
    return NextResponse.json(
      { error: "name and phone are required" },
      { status: 400 }
    );
  }

  const normalizedPhone = toE164(phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      {
        error: `"${phone}" isn't a callable number — use a 10-digit US number or +country format.`,
      },
      { status: 400 }
    );
  }

  // Agents can only file customers under themselves; admins may assign.
  const ownerId = auth.session.isAdmin
    ? agent_id || auth.session.agent.id
    : auth.session.agent.id;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      name,
      phone: normalizedPhone,
      email: email || null,
      company: company || null,
      notes: notes || null,
      agent_id: ownerId,
    })
    .select("*, agent:sales_agents(id, name, email)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}

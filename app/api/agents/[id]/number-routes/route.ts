import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";
import { NUMBER_ROUTING_REGIONS } from "@/lib/area-code-routing";

const VALID_REGIONS = new Set<string>([
  ...NUMBER_ROUTING_REGIONS.map((r) => r.key),
  "default",
]);

/** This agent's current region → connected-number mapping. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("agent_number_routes")
    .select("region, phone_number_id")
    .eq("agent_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ routes: data ?? [] });
}

/** Sets (or clears, when phone_number_id is null) which connected number one region dials from. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id !== auth.session.agent.id) {
    return NextResponse.json(
      { error: "you can only set number routing on your own account" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const region = body.region as string | undefined;
  const phoneNumberId = (body.phone_number_id as string | null | undefined) ?? null;

  if (!region || !VALID_REGIONS.has(region)) {
    return NextResponse.json({ error: "Unknown region" }, { status: 400 });
  }

  if (!phoneNumberId) {
    const { error } = await supabaseAdmin
      .from("agent_number_routes")
      .delete()
      .eq("agent_id", id)
      .eq("region", region);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, region, phoneNumberId: null });
  }

  const { data: number } = await supabaseAdmin
    .from("agent_phone_numbers")
    .select("id")
    .eq("id", phoneNumberId)
    .eq("agent_id", id)
    .maybeSingle();

  if (!number) {
    return NextResponse.json(
      { error: "That number isn't connected to your account." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("agent_number_routes")
    .upsert(
      { agent_id: id, region, phone_number_id: phoneNumberId },
      { onConflict: "agent_id,region" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, region, phoneNumberId });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";
import type { SalesAgent } from "@/types/database";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, email, calendly_url, calendly_access_token } = body ?? {};

  const updates: Partial<SalesAgent> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (calendly_url !== undefined) updates.calendly_url = calendly_url || null;

  if (calendly_access_token) {
    const { data: existing } = await supabaseAdmin
      .from("sales_agents")
      .select("calendly_access_token, calendly_webhook_uri")
      .eq("id", id)
      .single();

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

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update(updates)
    .eq("id", id)
    .select("id, name, email, calendly_url, calendly_user_uri, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data });
}

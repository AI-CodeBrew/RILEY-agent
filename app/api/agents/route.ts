import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectAgentCalendly } from "@/lib/calendly";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .select(
      "id, name, email, calendly_url, calendly_user_uri, vapi_phone_number, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agents: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, calendly_url, calendly_access_token } = body ?? {};

  if (!name || !email) {
    return NextResponse.json(
      { error: "name and email are required" },
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

  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .insert({
      name,
      email,
      calendly_url: calendly_url || null,
      calendly_access_token: calendly_access_token || null,
      ...calendlyFields,
    })
    .select(
      "id, name, email, calendly_url, calendly_user_uri, vapi_phone_number, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}

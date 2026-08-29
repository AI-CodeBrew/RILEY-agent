import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiSession } from "@/lib/auth";

/** Sends a direct message to another agent's inbox. */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const recipientId = typeof body.recipient_id === "string" ? body.recipient_id : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!recipientId) {
    return NextResponse.json({ error: "recipient_id is required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (recipientId === auth.session.agent.id) {
    return NextResponse.json({ error: "you can't message yourself" }, { status: 400 });
  }

  const { data: recipient } = await supabaseAdmin
    .from("sales_agents")
    .select("id")
    .eq("id", recipientId)
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: "recipient not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("direct_messages")
    .insert({
      sender_id: auth.session.agent.id,
      recipient_id: recipientId,
      body: text,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

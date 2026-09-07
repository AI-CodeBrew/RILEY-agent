import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Unauthenticated by design — this is the public marketing site's contact form. Reviewed by admins on the Contact Requests page. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { first_name, last_name, phone, email, address, comment } = body ?? {};

  if (!first_name || !last_name || !phone || !email) {
    return NextResponse.json(
      { error: "First name, last name, phone, and email are required." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("contact_requests").insert({
    first_name,
    last_name,
    phone,
    email,
    address: address || null,
    comment: comment || null,
  });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't send your message right now — please try again shortly." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

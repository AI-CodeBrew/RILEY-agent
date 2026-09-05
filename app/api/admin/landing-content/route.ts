import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildSlotUpdate,
  getLandingPageContent,
  LANDING_ASSETS_BUCKET,
  LANDING_CONTENT_SLOTS,
  slotStoragePath,
} from "@/lib/landing-content";
import type { LandingContentSlot } from "@/types/database";

async function removeStorageObject(path: string | null) {
  if (!path) return;
  await supabaseAdmin.storage.from(LANDING_ASSETS_BUCKET).remove([path]);
}

/** Confirms a signed-URL upload finished and points the live slot at it, replacing whatever object was there before. */
export async function POST(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const slot = body.slot as LandingContentSlot | undefined;
  const path = body.path as string | undefined;

  if (!slot || !LANDING_CONTENT_SLOTS[slot] || !path) {
    return NextResponse.json({ error: "invalid slot or path" }, { status: 400 });
  }

  const current = await getLandingPageContent();
  const previousPath = slotStoragePath(current, slot);

  const { data: publicUrl } = supabaseAdmin.storage
    .from(LANDING_ASSETS_BUCKET)
    .getPublicUrl(path);

  const { data, error } = await supabaseAdmin
    .from("landing_page_content")
    .update({
      ...buildSlotUpdate(slot, publicUrl.publicUrl, path),
      updated_at: new Date().toISOString(),
      updated_by: auth.session.agent.id,
    })
    .eq("id", "main")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (previousPath && previousPath !== path) {
    await removeStorageObject(previousPath);
  }

  return NextResponse.json({ content: data });
}

/** Clears a slot back to the marketing page's built-in fallback. */
export async function DELETE(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const slot = searchParams.get("slot") as LandingContentSlot | null;

  if (!slot || !LANDING_CONTENT_SLOTS[slot]) {
    return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }

  const current = await getLandingPageContent();
  const previousPath = slotStoragePath(current, slot);

  const { data, error } = await supabaseAdmin
    .from("landing_page_content")
    .update({
      ...buildSlotUpdate(slot, null, null),
      updated_at: new Date().toISOString(),
      updated_by: auth.session.agent.id,
    })
    .eq("id", "main")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await removeStorageObject(previousPath);

  return NextResponse.json({ content: data });
}

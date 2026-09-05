import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LANDING_ASSETS_BUCKET, LANDING_CONTENT_SLOTS } from "@/lib/landing-content";
import type { LandingContentSlot } from "@/types/database";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/**
 * Returns a short-lived signed Storage upload URL so the browser can PUT the
 * file straight to Supabase Storage — the file never passes through this
 * route, so a 300MB demo video isn't bounded by this app's own request body
 * limit. Confirm the upload afterwards via POST /api/admin/landing-content.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession({ adminOnly: true });
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const slot = body.slot as LandingContentSlot | undefined;
  const contentType = body.contentType as string | undefined;

  const config = slot ? LANDING_CONTENT_SLOTS[slot] : undefined;
  if (!config) {
    return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }
  if (!contentType || !config.mimeTypes.includes(contentType)) {
    return NextResponse.json(
      { error: `${config.label} must be one of: ${config.mimeTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const extension = EXTENSION_BY_MIME[contentType] ?? "bin";
  const path = `${slot}/${randomUUID()}.${extension}`;

  const { data, error } = await supabaseAdmin.storage
    .from(LANDING_ASSETS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create an upload URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ path, token: data.token });
}

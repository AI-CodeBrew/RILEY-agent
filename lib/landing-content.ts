import { supabaseAdmin } from "@/lib/supabase-admin";
import type { LandingContentSlot, LandingPageContent } from "@/types/database";

// Slot metadata lives in a separate isomorphic module so the client-side
// admin panel can import it without pulling this server-only file (and the
// Supabase service-role client it wraps) into the browser bundle.
export { LANDING_ASSETS_BUCKET, LANDING_CONTENT_SLOTS } from "@/lib/landing-content-slots";

/** Always the single 'main' row — creates it on first read if a fresh DB hasn't been seeded yet. */
export async function getLandingPageContent(): Promise<LandingPageContent> {
  const { data } = await supabaseAdmin
    .from("landing_page_content")
    .select("*")
    .eq("id", "main")
    .maybeSingle();

  if (data) return data;

  const { data: created } = await supabaseAdmin
    .from("landing_page_content")
    .upsert({ id: "main" })
    .select("*")
    .single();

  return (
    created ?? {
      id: "main",
      hero_image_url: null,
      hero_image_path: null,
      demo_video_url: null,
      demo_video_path: null,
      live_call_audio_url: null,
      live_call_audio_path: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
    }
  );
}

/** Builds the {slot}_url/{slot}_path update pair for one slot — explicit per-slot instead of a computed key so it stays type-checked against LandingPageContent. */
export function buildSlotUpdate(
  slot: LandingContentSlot,
  url: string | null,
  path: string | null
): Partial<LandingPageContent> {
  switch (slot) {
    case "hero_image":
      return { hero_image_url: url, hero_image_path: path };
    case "demo_video":
      return { demo_video_url: url, demo_video_path: path };
    case "live_call_audio":
      return { live_call_audio_url: url, live_call_audio_path: path };
  }
}

/** The storage object path currently live for a slot, or null. */
export function slotStoragePath(
  content: LandingPageContent,
  slot: LandingContentSlot
): string | null {
  switch (slot) {
    case "hero_image":
      return content.hero_image_path;
    case "demo_video":
      return content.demo_video_path;
    case "live_call_audio":
      return content.live_call_audio_path;
  }
}

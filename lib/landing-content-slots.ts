import type { LandingContentSlot } from "@/types/database";

export type { LandingContentSlot };

/**
 * Metadata for the three admin-editable landing-page media slots. Isomorphic
 * (no supabase-admin import) so the client-side admin panel can import it
 * directly without pulling the server-only Supabase admin client into the
 * browser bundle — see lib/landing-content.ts for the DB-touching half.
 */
export const LANDING_ASSETS_BUCKET = "landing-assets";

export const LANDING_CONTENT_SLOTS: Record<
  LandingContentSlot,
  { label: string; accept: string; mimeTypes: string[]; maxBytes: number }
> = {
  hero_image: {
    label: "Hero dashboard screenshot",
    accept: "image/png,image/jpeg,image/webp",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
  },
  demo_video: {
    label: "Watch Voice Agent Demo video",
    accept: "video/mp4,video/webm",
    mimeTypes: ["video/mp4", "video/webm"],
    maxBytes: 300 * 1024 * 1024,
  },
  live_call_audio: {
    label: "Hear a Live Call audio",
    accept: "audio/mpeg,audio/mp4,audio/wav,audio/webm",
    mimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"],
    maxBytes: 25 * 1024 * 1024,
  },
};

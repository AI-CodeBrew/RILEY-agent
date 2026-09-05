"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, ImageIcon, Music, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LANDING_CONTENT_SLOTS, LANDING_ASSETS_BUCKET } from "@/lib/landing-content-slots";
import type { LandingContentSlot, LandingPageContent } from "@/types/database";

const SLOT_ICON: Record<LandingContentSlot, typeof ImageIcon> = {
  hero_image: ImageIcon,
  demo_video: Film,
  live_call_audio: Music,
};

const SLOT_HINT: Record<LandingContentSlot, string> = {
  hero_image:
    "Replaces the dashboard mockup in the hero section with this screenshot.",
  demo_video:
    "Plays inline in the platform section and when a visitor clicks “Watch Voice Agent Demo.”",
  live_call_audio: "Plays when a visitor clicks “Hear a Live Call.”",
};

function formatMax(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}MB max`;
}

function Preview({ slot, url }: { slot: LandingContentSlot; url: string | null }) {
  if (!url) return null;

  if (slot === "hero_image") {
    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary remote URL
    return <img src={url} alt="" className="h-24 w-auto rounded-lg border border-border object-cover" />;
  }
  if (slot === "demo_video") {
    return (
      <video src={url} controls className="h-24 w-auto rounded-lg border border-border" />
    );
  }
  return <audio src={url} controls className="h-9 max-w-full" />;
}

function SlotRow({
  slot,
  content,
  onChange,
}: {
  slot: LandingContentSlot;
  content: LandingPageContent;
  onChange: (next: LandingPageContent) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const config = LANDING_CONTENT_SLOTS[slot];
  const Icon = SLOT_ICON[slot];
  const url = content[`${slot}_url`] as string | null;

  async function handleFile(file: File) {
    if (!config.mimeTypes.includes(file.type)) {
      toast(`${config.label} must be one of: ${config.mimeTypes.join(", ")}`, "error");
      return;
    }
    if (file.size > config.maxBytes) {
      toast(`${config.label} must be under ${formatMax(config.maxBytes)}.`, "error");
      return;
    }

    setUploading(true);
    try {
      const signRes = await fetch("/api/admin/landing-content/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, contentType: file.type }),
      });
      const signBody = await signRes.json().catch(() => ({}));
      if (!signRes.ok) {
        toast(signBody.error ?? "Could not start the upload.", "error");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(LANDING_ASSETS_BUCKET)
        .uploadToSignedUrl(signBody.path, signBody.token, file);

      if (uploadError) {
        toast(uploadError.message ?? "Upload failed.", "error");
        return;
      }

      const confirmRes = await fetch("/api/admin/landing-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, path: signBody.path }),
      });
      const confirmBody = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) {
        toast(confirmBody.error ?? "Upload finished but could not be saved.", "error");
        return;
      }

      onChange(confirmBody.content);
      toast(`${config.label} updated.`, "success");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    const res = await fetch(`/api/admin/landing-content?slot=${slot}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setRemoving(false);

    if (!res.ok) {
      toast(body.error ?? "Could not remove it.", "error");
      return;
    }

    onChange(body.content);
    toast(`${config.label} removed — the landing page will use its default again.`, "success");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{config.label}</p>
          <p className="text-xs text-muted">{SLOT_HINT[slot]}</p>
          <p className="mt-1 text-xs text-muted">
            {config.mimeTypes.map((m) => m.split("/")[1]).join(", ")} · {formatMax(config.maxBytes)}
          </p>
          {url && (
            <div className="mt-2">
              <Preview slot={slot} url={url} />
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {!uploading && <Upload className="h-3.5 w-3.5" />}
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button
            variant="ghost"
            size="sm"
            loading={removing}
            onClick={handleRemove}
            aria-label={`Remove ${config.label}`}
          >
            {!removing && <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Admin-only CMS for the three pieces of media the public landing page
 * (app/page.tsx) reads at request time: the hero screenshot, the demo
 * video, and the live-call audio clip. Uploads go straight from the browser
 * to Supabase Storage via a signed URL — see /api/admin/landing-content/sign
 * — so this never proxies large video files through the app server.
 */
export function LandingPagePanel({ content: initial }: { content: LandingPageContent }) {
  const [content, setContent] = useState(initial);

  return (
    <div className="space-y-3">
      <SlotRow slot="hero_image" content={content} onChange={setContent} />
      <SlotRow slot="demo_video" content={content} onChange={setContent} />
      <SlotRow slot="live_call_audio" content={content} onChange={setContent} />
    </div>
  );
}

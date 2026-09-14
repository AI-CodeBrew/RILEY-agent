"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * "Hear a Live Call" — toggles playback of the admin-uploaded recording
 * (Settings → Manage landing page). Renders as an inert button until one is
 * uploaded, rather than linking nowhere.
 */
export function LiveCallButton({ audioUrl }: { audioUrl?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!audioUrl) {
    return (
      <span
        aria-disabled
        title="No recording uploaded yet"
        className="mt-8 inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-[var(--lp-blue)]/40 px-6 py-3 text-sm font-semibold text-white/70"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> Hear a Live Call
      </span>
    );
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--lp-blue)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--lp-blue-hover)]"
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" />
        )}
        {playing ? "Playing the call…" : "Hear a Live Call"}
      </button>
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </>
  );
}

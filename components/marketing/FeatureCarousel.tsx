"use client";

import { Children, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SPEED_PX_PER_SEC = 34;
const BUTTON_PAUSE_MS = 500;
const GAP_PX = 20;

/**
 * Feature card row that drifts right-to-left on its own, continuously —
 * hovering, wheel-scrolling, and touch-scrolling never stop it, they just
 * layer on top of the drift. The only thing that stops it is actually
 * pressing down on the track (to drag it, or just to hold a card in place);
 * releasing resumes the drift immediately, no delay. The child list is
 * duplicated once so both the drift and the arrows can wrap around
 * seamlessly in either direction.
 */
export function FeatureCarousel({ children }: { children: ReactNode[] }) {
  const items = Children.toArray(children);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pausedRef.current = reducedMotionRef.current;

    let raf = requestAnimationFrame(tick);

    function tick(ts: number) {
      const track = trackRef.current;
      if (track) {
        if (!pausedRef.current && lastTsRef.current != null) {
          const dt = (ts - lastTsRef.current) / 1000;
          const half = track.scrollWidth / 2;
          let next = track.scrollLeft + SPEED_PX_PER_SEC * dt;
          if (next >= half) next -= half;
          track.scrollLeft = next;
        }
        lastTsRef.current = ts;
      }
      raf = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(raf);
  }, []);

  function clearResumeTimer() {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }

  /** Resumes right away — used when a press/drag ends. */
  function resumeNow() {
    clearResumeTimer();
    pausedRef.current = reducedMotionRef.current;
  }

  /** Pauses for a fixed, short window — used for the arrow buttons' smooth-scroll animation. */
  function pauseBriefly() {
    pausedRef.current = true;
    clearResumeTimer();
    resumeTimer.current = setTimeout(resumeNow, BUTTON_PAUSE_MS);
  }

  function wrap(value: number, half: number) {
    if (half <= 0) return value;
    let v = value % half;
    if (v < 0) v += half;
    return v;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Touch already scrolls natively without fighting the drift — only take over for mouse/pen.
    if (e.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;

    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollRef.current = track.scrollLeft;
    pausedRef.current = true;
    clearResumeTimer();
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort — dragging still works without it as long as
      // the pointer stays over the track; only off-track moves would miss.
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const dx = e.clientX - dragStartXRef.current;
    const half = track.scrollWidth / 2;
    track.scrollLeft = wrap(dragStartScrollRef.current - dx, half);
  }

  function endDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    resumeNow();
  }

  function step(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    pauseBriefly();

    const card = track.querySelector<HTMLElement>("[data-card]");
    const cardWidth = (card?.offsetWidth ?? track.clientWidth / 3) + GAP_PX;
    const half = track.scrollWidth / 2;

    let next = track.scrollLeft + direction * cardWidth;
    if (next < 0) next += half;
    if (next >= half) next -= half;
    track.scrollTo({ left: next, behavior: "smooth" });
  }

  return (
    <div className="relative mt-12">
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-grab select-none gap-5 overflow-x-auto pb-2 active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)] [&::-webkit-scrollbar]:hidden"
      >
        {[...items, ...items].map((child, i) => (
          <div
            key={i}
            data-card
            aria-hidden={i >= items.length}
            className="w-[280px] shrink-0 sm:w-[300px] lg:w-[340px]"
          >
            {child}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Show the previous feature"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lp-light-border)] text-[var(--lp-light-text)] transition-colors hover:bg-[var(--lp-light-bg-soft)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Show the next feature"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lp-light-border)] text-[var(--lp-light-text)] transition-colors hover:bg-[var(--lp-light-bg-soft)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

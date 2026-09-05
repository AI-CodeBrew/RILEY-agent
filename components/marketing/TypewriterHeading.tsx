"use client";

import { useEffect, useState } from "react";

const LINE_1 = "A voice agent that qualifies, calls, and books";
const LINE_2 = "while your team sleeps.";
const FULL_TEXT = `${LINE_1}\n${LINE_2}`;
const CHAR_DELAY_MS = 45;
const START_DELAY_MS = 300;

function Cursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[0.85em] w-[3px] translate-y-[0.1em] animate-[typewriter-blink_0.9s_steps(1)_infinite] bg-current align-middle"
    />
  );
}

/**
 * Types the hero headline out one character at a time on mount, once. The
 * real text stays in a sr-only span so screen readers and SEO crawlers get
 * the full heading immediately rather than the animated empty start.
 */
export function TypewriterHeading() {
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let index = 0;
    let charTimer: ReturnType<typeof setTimeout>;

    function tick() {
      index += 1;
      setTyped(index);
      if (index < FULL_TEXT.length) {
        charTimer = setTimeout(tick, CHAR_DELAY_MS);
      }
    }

    const startTimer = setTimeout(tick, START_DELAY_MS);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(charTimer);
    };
  }, []);

  const shown = FULL_TEXT.slice(0, typed);
  const [line1 = "", line2 = ""] = shown.split("\n");
  const onLine2 = shown.includes("\n");
  const isTyping = typed < FULL_TEXT.length;

  return (
    <h1 className="relative mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
      {/* Invisible full-text placeholder reserves the exact box up front
          (wrapping exactly like the real text would) so the typing overlay
          below never changes the heading's size and nothing reflows. */}
      <span aria-hidden="true" className="invisible block">
        {LINE_1}
      </span>
      <span aria-hidden="true" className="invisible block">
        {LINE_2}
      </span>

      {/* Overlay sits on top of the placeholder; its two lines stack in
          normal flow (line 2 starts wherever line 1 ends), so it stays
          correct even if line 1 wraps onto more than one row. */}
      <span aria-hidden="true" className="absolute inset-0 block">
        <span className="block">
          {line1}
          {!onLine2 && isTyping && <Cursor />}
        </span>
        <span className="block text-[var(--lp-accent)]">
          {line2}
          {onLine2 && isTyping && <Cursor />}
        </span>
      </span>

      <span className="sr-only">
        {LINE_1} {LINE_2}
      </span>
    </h1>
  );
}

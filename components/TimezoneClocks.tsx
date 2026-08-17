"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { CANADA_TIME_ZONES, formatShortTimeInTimezone } from "@/lib/canada-timezones";

const UPDATE_INTERVAL_MS = 30_000;

/**
 * useSyncExternalStore calls getSnapshot repeatedly to check whether the
 * store changed, and expects the same value back until it actually has.
 * Date.now() changes on every call, so returning it directly made React see
 * a "new" snapshot on every check and re-render in a loop. Caching it here
 * and only advancing it when the interval ticks keeps it stable in between.
 */
let cachedNowMs = Date.now();

/**
 * A plain setInterval ticks every 30s from whatever arbitrary moment the
 * page happened to load — so the displayed minute could lag up to 30s
 * behind the real one before refreshing. Re-deriving the delay to the next
 * wall-clock :00/:30 mark on every tick keeps updates aligned to real
 * clock boundaries instead, and self-corrects for any drift (e.g. a
 * throttled background tab) rather than accumulating it the way a fixed
 * setInterval would.
 */
function msUntilNextBoundary(): number {
  return UPDATE_INTERVAL_MS - (Date.now() % UPDATE_INTERVAL_MS);
}

function subscribe(onStoreChange: () => void) {
  let timeoutId: ReturnType<typeof setTimeout>;

  function tick() {
    cachedNowMs = Date.now();
    onStoreChange();
    timeoutId = setTimeout(tick, msUntilNextBoundary());
  }

  timeoutId = setTimeout(tick, msUntilNextBoundary());
  return () => clearTimeout(timeoutId);
}

function getSnapshot(): number | null {
  return cachedNowMs;
}

function getServerSnapshot(): number | null {
  return null;
}

/**
 * Live time-of-day per Canada region, ticking every 30s. Backed by
 * useSyncExternalStore rather than useState+useEffect, so re-renders come
 * from the subscribed interval itself instead of a setState call inside an
 * effect body. The server can't know "now", so getServerSnapshot returns
 * null and nothing renders until the client subscribes and gets a real
 * timestamp — no hydration mismatch.
 *
 * Sits in a PageHeader's `action` slot (see the dashboard) — a compact
 * horizontal strip of chips rather than a stacked list, so it reads as one
 * unit next to the page title instead of a block of its own.
 */
export function TimezoneClocks() {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (nowMs === null) return null;

  const isoNow = new Date(nowMs).toISOString();

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-accent/20 bg-accent-soft px-5 py-3.5 shadow-sm">
      <Clock className="h-5 w-5 shrink-0 text-accent" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {CANADA_TIME_ZONES.map((zone, index) => (
          <div
            key={zone.id}
            className={`flex flex-col items-start leading-tight ${
              index > 0 ? "border-l border-accent/20 pl-5" : ""
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {zone.label}
            </span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatShortTimeInTimezone(isoNow, zone.iana)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-runs the server component that rendered this while something is live
 * (a ringing/connected call). Cheap enough at a few seconds because the
 * pages it's used on are already `force-dynamic`, and it stops as soon as
 * `active` goes false.
 */
export function AutoRefresh({
  active,
  intervalMs = 8000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [active, intervalMs, router]);

  return null;
}

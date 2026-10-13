"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

const DAY_MS = 86_400_000;
/** A little past the ~14 days Vapi keeps individual calls for. */
const DAYS = 15;

/**
 * Re-reads every call Vapi still has and corrects its saved cost — one
 * request per day, newest first, so a busy day can't time the whole sync out.
 * The hourly cron does the same for the last day on its own; this is for
 * checking right now, or catching up after the cron was down.
 */
export function SyncCostsButton() {
  const router = useRouter();
  const toast = useToast();
  const [day, setDay] = useState<number | null>(null);

  async function sync() {
    const now = Date.now();
    let updated = 0;
    let incomplete = false;

    for (let i = 0; i < DAYS; i++) {
      setDay(i + 1);
      const res = await fetch("/api/admin/vapi-cost/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMs: now - (i + 1) * DAY_MS, toMs: now - i * DAY_MS }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) {
        setDay(null);
        toast(body.error ?? "Could not sync costs from Vapi.", "error");
        router.refresh();
        return;
      }
      updated += body.updated ?? 0;
      incomplete = incomplete || Boolean(body.incomplete);
    }

    setDay(null);
    if (incomplete) {
      toast("Vapi didn't return every call in time — run the sync again.", "error");
    } else {
      toast(
        updated > 0
          ? `${updated.toLocaleString()} call ${updated === 1 ? "cost" : "costs"} updated from Vapi.`
          : "Saved costs already match Vapi.",
        "success"
      );
    }
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" loading={day !== null} onClick={sync}>
      {day === null && <RefreshCw className="h-3.5 w-3.5" />}
      {day === null ? "Sync from Vapi" : `Syncing day ${day} of ${DAYS}…`}
    </Button>
  );
}

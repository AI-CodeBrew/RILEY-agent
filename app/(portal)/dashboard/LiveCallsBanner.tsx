"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { CallStatusBadge } from "@/lib/status-badge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CancelCallButton } from "@/components/CancelCallButton";
import { formatRelative } from "@/lib/format";
import type { CallWithRelations } from "@/types/database";

/** Sticky "Riley is on the phone right now" strip, with a hang-up per call. */
export function LiveCallsBanner({ calls }: { calls: CallWithRelations[] }) {
  if (calls.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <AutoRefresh active />
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
        <Radio className="h-4 w-4 animate-pulse" />
        {calls.length === 1 ? "1 call in flight" : `${calls.length} calls in flight`}
      </div>
      <ul className="space-y-2">
        {calls.map((call) => (
          <li
            key={call.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`/customers/${call.customer_id}`}
                className="text-sm font-medium hover:text-accent"
              >
                {call.customer?.name ?? "Unknown customer"}
              </Link>
              <p className="text-xs text-muted">
                {call.agent?.name ? `${call.agent.name} · ` : ""}
                started {formatRelative(call.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CallStatusBadge status={call.status} />
              <CancelCallButton
                callId={call.id}
                customerName={call.customer?.name ?? "this customer"}
                status={call.status}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

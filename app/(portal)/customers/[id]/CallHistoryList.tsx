"use client";

import { useState } from "react";
import { ChevronDown, PhoneCall } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { CallNotesCard } from "@/components/CallNotesCard";
import { StatusBadge } from "@/lib/status-badge";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatRelative,
} from "@/lib/format";
import type { Call } from "@/types/database";

const PAGE_SIZE = 10;

export function CallHistoryList({
  calls,
  timezone,
}: {
  calls: Call[];
  timezone: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageCalls = calls.slice(start, start + PAGE_SIZE);

  if (calls.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={PhoneCall}
          title="No calls yet"
          description="Trigger a call above to get started."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {pageCalls.map((call) => (
          <Card key={call.id} className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {formatDateTime(call.created_at, timezone)}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {call.summary ??
                      call.ended_reason?.replaceAll("-", " ") ??
                      "No summary captured"}
                    {" · "}
                    {formatRelative(call.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {call.duration_seconds !== null && (
                    <span className="text-xs text-muted">
                      {formatDuration(call.duration_seconds)}
                    </span>
                  )}
                  {call.cost !== null && (
                    <span className="text-xs text-muted">{formatCost(call.cost)}</span>
                  )}
                  <StatusBadge status={call.outcome ?? call.status} />
                  <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
                </div>
              </summary>

              <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                <CallNotesCard
                  compact
                  summary={call.summary}
                  callInsights={call.call_insights}
                />

                {call.transcript && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                      Transcript
                    </summary>
                    <p className="scroll-area mt-2 max-h-64 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm">
                      {call.transcript}
                    </p>
                  </details>
                )}

                {call.ended_reason && !call.transcript && (
                  <p className="text-xs text-muted">
                    Ended: {call.ended_reason.replaceAll("-", " ")}
                  </p>
                )}
              </div>
            </details>
          </Card>
        ))}
      </div>

      {calls.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {start + 1}–{Math.min(start + PAGE_SIZE, calls.length)} of {calls.length}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage >= totalPages - 1}
              onClick={() =>
                setPage((current) => Math.min(totalPages - 1, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

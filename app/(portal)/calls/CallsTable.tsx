"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { CallStatusBadge, StatusBadge } from "@/lib/status-badge";
import { formatDateTime, formatDuration, formatPhone, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { CancelCallButton } from "@/components/CancelCallButton";
import { TranscriptButton } from "./TranscriptButton";
import { LIVE_CALL_STATUSES, type CallWithRelations } from "@/types/database";

const COLLAPSED_LIMIT = 10;

export function CallsTable({
  calls,
  isAdmin,
  timezone,
  emptyTitle,
}: {
  calls: CallWithRelations[];
  isAdmin: boolean;
  timezone: string;
  emptyTitle: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCalls = expanded ? calls : calls.slice(0, COLLAPSED_LIMIT);

  return (
    <Card className="overflow-hidden">
      {calls.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Customer</th>
                  {isAdmin && <th className="px-4 py-3">Agent</th>}
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Length</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleCalls.map((call) => {
                  const isLive = LIVE_CALL_STATUSES.some((status) => status === call.status);
                  return (
                    <tr
                      key={call.id}
                      className="border-b border-border last:border-0 hover:bg-background"
                    >
                      <td className="px-4 py-3">
                        <p className="whitespace-nowrap">
                          {formatDateTime(call.scheduled_for ?? call.created_at, timezone)}
                        </p>
                        <p className="text-xs text-muted">
                          {formatRelative(call.scheduled_for ?? call.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {call.customer ? (
                          <>
                            <Link
                              href={`/customers/${call.customer.id}`}
                              className="font-medium hover:text-accent"
                            >
                              {call.customer.name}
                            </Link>
                            {isAdmin && (
                              <p className="text-xs text-muted">{formatPhone(call.customer.phone)}</p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-muted">{call.agent?.name ?? "—"}</td>
                      )}
                      <td className="px-4 py-3">
                        <CallStatusBadge status={call.status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={call.outcome} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isLive ? (
                          <CancelCallButton
                            callId={call.id}
                            customerName={call.customer?.name ?? "this customer"}
                            status={call.status}
                          />
                        ) : call.vapi_call_id ? (
                          <TranscriptButton callId={call.id} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ShowMoreButton
            totalCount={calls.length}
            visibleCount={visibleCalls.length}
            expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          />
        </>
      ) : (
        <EmptyState
          icon={PhoneCall}
          title={emptyTitle}
          description="Trigger one from a customer's page."
        />
      )}
    </Card>
  );
}

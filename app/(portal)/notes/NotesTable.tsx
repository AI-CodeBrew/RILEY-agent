"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { CallNotesCard } from "@/components/CallNotesCard";
import { StatusBadge } from "@/lib/status-badge";
import { notePreview, parseCallInsights } from "@/lib/call-notes";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import type { CallWithRelations } from "@/types/database";

type CallRow = CallWithRelations & {
  /** phone absent for an agent session — redacted server-side, see lib/customer-visibility.ts. */
  customer: { id: string; name: string; phone?: string } | null;
  transcript?: string | null;
};

export function NotesTable({
  rows,
  showAgent,
  timezone,
}: {
  rows: CallRow[];
  showAgent: boolean;
  timezone: string;
}) {
  const [selected, setSelected] = useState<CallRow | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Call</th>
                {showAgent && <th className="px-4 py-3">Agent</th>}
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((call) => {
                const customer = call.customer;
                if (!customer) return null;
                const preview = notePreview(
                  parseCallInsights(call.call_insights),
                  call.summary,
                  120,
                  call.transcript
                );

                return (
                  <tr
                    key={call.id}
                    onClick={() => setSelected(call)}
                    className="cursor-pointer hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <Avatar name={customer.name} />
                        <span>
                          {customer.name}
                          {customer.phone && (
                            <span className="mt-0.5 block text-xs font-normal text-muted">
                              {formatPhone(customer.phone)}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <p>{formatDateTime(call.created_at, timezone)}</p>
                      <p className="text-xs">{formatRelative(call.created_at)}</p>
                    </td>
                    {showAgent && (
                      <td className="px-4 py-3 text-muted">{call.agent?.name ?? "—"}</td>
                    )}
                    <td className="max-w-md px-4 py-3 text-muted">{preview ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={call.outcome ?? call.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.customer ? `${selected.customer.name} — call notes & insights` : "Call notes & insights"}
        description={selected ? formatDateTime(selected.created_at, timezone) : undefined}
      >
        {selected && (
          <CallNotesCard
            title="Call notes & insights"
            summary={selected.summary}
            callInsights={selected.call_insights}
          />
        )}
      </Modal>
    </>
  );
}

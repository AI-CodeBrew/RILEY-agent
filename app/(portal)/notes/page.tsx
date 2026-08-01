import Link from "next/link";
import { StickyNote } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/lib/status-badge";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import { hasCallNotes, notePreview, parseCallInsights } from "@/lib/call-notes";
import type { CallWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

type CallRow = CallWithRelations & {
  customer: { id: string; name: string; phone: string } | null;
};

export default async function NotesPage() {
  const session = await requireSession();

  let query = applyAgentScope(
    supabaseAdmin
      .from("calls")
      .select(
        "id, created_at, outcome, status, summary, call_insights, customer:customers(id, name, phone), agent:sales_agents(id, name)"
      )
      .eq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(300),
    session
  );

  const { data, error } = await query;
  const allRows = (data ?? []) as CallRow[];

  const rows = allRows.filter((call) =>
    hasCallNotes(parseCallInsights(call.call_insights), call.summary)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call notes"
        description="Notes Abby captured on each call — household, scheduling, email, and appointment details."
      />

      {error && (
        <p className="text-sm text-red-600">Could not load call notes: {error.message}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No call notes yet"
          description="After Abby completes outbound calls, structured notes from the script appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Call</th>
                  {session.isAdmin && <th className="px-4 py-3">Agent</th>}
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
                    call.summary
                  );

                  return (
                    <tr key={call.id} className="hover:bg-background">
                      <td className="px-4 py-3">
                        <Link
                          href={`/notes/${customer.id}`}
                          className="flex items-center gap-2 font-medium hover:text-accent"
                        >
                          <Avatar name={customer.name} />
                          <span>
                            {customer.name}
                            <span className="mt-0.5 block text-xs font-normal text-muted">
                              {formatPhone(customer.phone)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <p>{formatDateTime(call.created_at, session.agent.timezone)}</p>
                        <p className="text-xs">{formatRelative(call.created_at)}</p>
                      </td>
                      {session.isAdmin && (
                        <td className="px-4 py-3 text-muted">{call.agent?.name ?? "—"}</td>
                      )}
                      <td className="max-w-md px-4 py-3 text-muted">
                        {preview ?? "—"}
                      </td>
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
      )}
    </div>
  );
}

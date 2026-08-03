import { PhoneIncoming } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatPhone, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { InboundCall } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function InboundCallsPage() {
  const session = await requireSession();

  const query = applyAgentScope(
    supabaseAdmin
      .from("inbound_calls")
      .select("*, agent:sales_agents(id, name)")
      .order("created_at", { ascending: false })
      .limit(200),
    session
  );

  const { data, error } = await query;
  const rows = (data ?? []) as (InboundCall & {
    agent: { id: string; name: string } | null;
  })[];

  const repeatTotal = rows.filter((row) => row.is_repeat).length;

  return (
    <div className="space-y-6">
      <AutoRefresh active intervalMs={15000} />

      <PageHeader
        title="Inbound calls"
        description="Callers who rang your outbound number back. These are logged only — Abby never picks up inbound calls."
      />

      {error && (
        <p className="text-sm text-red-600">
          Could not load inbound calls. Run migration 00000000000009_inbound_calls.sql.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={PhoneIncoming}
          title="No inbound calls yet"
          description="When someone calls your agent number back, it appears here automatically."
        />
      ) : (
        <>
          {repeatTotal > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {repeatTotal} repeat caller{repeatTotal === 1 ? "" : "s"} highlighted below.
            </p>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Caller</th>
                    <th className="px-4 py-3">Your number</th>
                    {session.isAdmin && <th className="px-4 py-3">Agent</th>}
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        row.is_repeat &&
                          "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{formatPhone(row.caller_phone)}</div>
                        {row.caller_name && (
                          <div className="text-xs text-muted">{row.caller_name}</div>
                        )}
                        {row.is_repeat && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Repeat caller · {row.repeat_count}x
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatPhone(row.called_number)}</td>
                      {session.isAdmin && (
                        <td className="px-4 py-3 text-muted">{row.agent?.name ?? "—"}</td>
                      )}
                      <td className="px-4 py-3 text-muted">
                        {formatRelative(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          not answered
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

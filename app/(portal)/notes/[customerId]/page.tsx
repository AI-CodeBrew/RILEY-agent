import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PhoneCall, StickyNote } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { CallNotesCard } from "@/components/CallNotesCard";
import { StatusBadge } from "@/lib/status-badge";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatPhone,
  formatRelative,
} from "@/lib/format";
import { noteFieldsFromInsights, parseCallInsights } from "@/lib/call-notes";
import type { Call, Customer } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerNotesPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await requireSession();
  const { customerId } = await params;

  const [{ data: customer }, { data: calls }] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("*, agent:sales_agents(id, name)")
      .eq("id", customerId)
      .maybeSingle(),
    supabaseAdmin
      .from("calls")
      .select("*")
      .eq("customer_id", customerId)
      .eq("status", "ended")
      .order("created_at", { ascending: false }),
  ]);

  if (!customer) notFound();

  if (!session.isAdmin && customer.agent_id !== session.agent.id) {
    notFound();
  }

  const callRows = (calls ?? []) as Call[];
  const typedCustomer = customer as Customer & { agent: { id: string; name: string } | null };
  const latestInsights = parseCallInsights(typedCustomer.call_insights);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/notes"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to call notes
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={typedCustomer.name} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{typedCustomer.name}</h1>
                <StatusBadge status={typedCustomer.status} />
              </div>
              <p className="text-sm text-muted">
                {formatPhone(typedCustomer.phone)}
                {typedCustomer.email ? ` · ${typedCustomer.email}` : ""}
              </p>
              {session.isAdmin && (
                <p className="text-xs text-muted">
                  Owner: {typedCustomer.agent?.name ?? "unassigned"}
                </p>
              )}
            </div>
          </div>

          <Link
            href={`/customers/${customerId}`}
            className="text-sm text-accent hover:underline"
          >
            Open customer profile →
          </Link>
        </div>
      </div>

      {(typedCustomer.last_call_summary || noteFieldsFromInsights(latestInsights).length > 0) && (
        <Card className="p-4">
          <CallNotesCard
            title="Latest on file"
            summary={typedCustomer.last_call_summary}
            callInsights={typedCustomer.call_insights}
          />
        </Card>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4 text-accent" />
          Notes by call ({callRows.length})
        </h2>

        {callRows.length > 0 ? (
          <div className="space-y-3">
            {callRows.map((call) => (
              <Card key={call.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {formatDateTime(call.created_at, session.agent.timezone)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{formatRelative(call.created_at)}</span>
                    {call.duration_seconds !== null && (
                      <span className="text-xs text-muted">
                        {formatDuration(call.duration_seconds)}
                      </span>
                    )}
                    {call.cost !== null && (
                      <span className="text-xs text-muted">{formatCost(call.cost)}</span>
                    )}
                    <StatusBadge status={call.outcome ?? call.status} />
                  </div>
                </div>

                <CallNotesCard
                  compact
                  summary={call.summary}
                  callInsights={call.call_insights}
                />

                {call.transcript && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                      Transcript
                    </summary>
                    <p className="scroll-area mt-2 max-h-64 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm">
                      {call.transcript}
                    </p>
                  </details>
                )}

                {call.recording_url && (
                  <audio controls src={call.recording_url} className="mt-3 h-9 w-full" />
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={PhoneCall}
              title="No completed calls yet"
              description="Notes appear here after Abby finishes an outbound call."
            />
          </Card>
        )}
      </section>
    </div>
  );
}

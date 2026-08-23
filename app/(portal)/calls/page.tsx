import Link from "next/link";
import { PhoneCall, PhoneOff, Timer } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { CallStatusBadge, StatusBadge } from "@/lib/status-badge";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatPhone,
  formatRelative,
} from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { FilterPills } from "@/components/Filters";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CancelCallButton } from "@/components/CancelCallButton";
import { TranscriptButton } from "./TranscriptButton";
import {
  LIVE_CALL_STATUSES,
  type CallOutcome,
  type CallWithRelations,
} from "@/types/database";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: null, label: "All" },
  { value: "live", label: "In flight" },
  { value: "appointment_set", label: "Booked" },
  { value: "no_answer", label: "No answer" },
  { value: "voicemail", label: "Voicemail" },
  { value: "not_interested", label: "Not interested" },
  { value: "call_back_later", label: "Call back" },
];

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; agent?: string }>;
}) {
  const session = await requireSession();
  const { outcome, agent: agentFilter } = await searchParams;

  let query = applyAgentScope(
    supabaseAdmin
      .from("calls")
      // `calls` points at sales_agents twice (agent_id, triggered_by), so the
      // embed has to name the constraint or PostgREST refuses as ambiguous.
      // Narrowed to what this table actually renders — the transcript is
      // fetched on demand by TranscriptButton (GET /api/calls/[id]/transcript)
      // rather than needing to ride along with every row here.
      .select(
        "id, created_at, scheduled_for, status, outcome, duration_seconds, cost, vapi_call_id, customer:customers(id, name, phone), agent:sales_agents!calls_agent_id_fkey(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    session,
    { requestedAgentId: agentFilter }
  );

  if (outcome === "live") {
    query = query.in("status", [...LIVE_CALL_STATUSES]);
  } else if (outcome) {
    query = query.eq("outcome", outcome as NonNullable<CallOutcome>);
  }

  const { data, error } = await query;
  const calls = (data ?? []) as CallWithRelations[];

  const { data: agents } = session.isAdmin
    ? await supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : { data: null };

  const liveCalls = calls.filter((call) =>
    LIVE_CALL_STATUSES.some((status) => status === call.status)
  );
  const finished = calls.filter((call) => call.status === "ended");
  const totalSeconds = finished.reduce(
    (sum, call) => sum + (call.duration_seconds ?? 0),
    0
  );
  const totalCost = finished.reduce((sum, call) => sum + (call.cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <AutoRefresh active={liveCalls.length > 0} />

      <PageHeader
        title="Calls"
        description="Every outbound call Riley placed for you — with transcripts, recordings and a hang-up button for anything still live."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="In flight"
          value={liveCalls.length}
          icon={PhoneCall}
          tone={liveCalls.length > 0 ? "danger" : "default"}
          hint={liveCalls.length > 0 ? "cancel from the row" : "nothing dialling"}
        />
        <StatCard
          label="Talk time"
          value={formatDuration(totalSeconds)}
          icon={Timer}
          hint={`${finished.length} completed calls`}
        />
        <StatCard
          label="Spend"
          value={formatCost(totalCost)}
          icon={PhoneOff}
          hint="Vapi + telephony, as reported"
        />
      </div>

      <div className="flex flex-col gap-3">
        <FilterPills paramKey="outcome" options={FILTERS} />
        {session.isAdmin && agents && agents.length > 0 && (
          <FilterPills
            paramKey="agent"
            options={[
              { value: null, label: "All agents" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">Failed to load calls: {error.message}</p>
      )}

      <Card className="overflow-hidden">
        {calls.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Customer</th>
                  {session.isAdmin && <th className="px-4 py-3">Agent</th>}
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Length</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const isLive = LIVE_CALL_STATUSES.some(
                    (status) => status === call.status
                  );
                  return (
                    <tr
                      key={call.id}
                      className="border-b border-border last:border-0 hover:bg-background"
                    >
                      <td className="px-4 py-3">
                        <p className="whitespace-nowrap">
                          {formatDateTime(
                            call.scheduled_for ?? call.created_at,
                            session.agent.timezone
                          )}
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
                            {session.isAdmin && (
                              <p className="text-xs text-muted">
                                {formatPhone(call.customer.phone)}
                              </p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {session.isAdmin && (
                        <td className="px-4 py-3 text-muted">
                          {call.agent?.name ?? "—"}
                        </td>
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
        ) : (
          <EmptyState
            icon={PhoneCall}
            title={outcome ? "No calls match that filter" : "No calls yet"}
            description="Trigger one from a customer's page."
          />
        )}
      </Card>
    </div>
  );
}

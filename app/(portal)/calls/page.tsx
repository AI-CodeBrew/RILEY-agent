import { PhoneCall, PhoneOff, Timer } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { formatCost, formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { FilterPills } from "@/components/Filters";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CallsTable } from "./CallsTable";
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

  // The calls query and the admin-only agents query don't depend on each
  // other, so they're run concurrently instead of one after the other.
  const agentsQuery = session.isAdmin
    ? supabaseAdmin.from("sales_agents").select("id, name").order("name")
    : Promise.resolve({ data: null as { id: string; name: string }[] | null });

  const [{ data, error }, { data: agents }] = await Promise.all([query, agentsQuery]);
  const calls = (data ?? []) as CallWithRelations[];

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
        {session.isAdmin ? (
          <StatCard
            label="Spend"
            value={formatCost(totalCost)}
            icon={PhoneOff}
            hint="Vapi + telephony, as reported"
          />
        ) : (
          <StatCard
            label="Total calls"
            value={calls.length}
            icon={PhoneOff}
            hint={`${finished.length} completed`}
          />
        )}
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

      <CallsTable
        calls={calls}
        isAdmin={session.isAdmin}
        timezone={session.agent.timezone}
        emptyTitle={outcome ? "No calls match that filter" : "No calls yet"}
      />
    </div>
  );
}

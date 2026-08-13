import { UserRound } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AgentRow, type AgentRowData } from "./AgentRow";
import { PendingAgentRow, type PendingAgent } from "./PendingAgentRow";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  // Approving registrations is an admin job.
  await requireAdmin();

  const { data: agents, error } = await supabaseAdmin
    .from("sales_agents")
    .select(
      "id, name, email, phone, role, is_active, approval_status, rejection_reason, calendly_url, calendly_user_uri, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: customerCounts } = await supabaseAdmin
    .from("customers")
    .select("agent_id");

  const perAgent = new Map<string, number>();
  for (const row of customerCounts ?? []) {
    if (!row.agent_id) continue;
    perAgent.set(row.agent_id, (perAgent.get(row.agent_id) ?? 0) + 1);
  }

  const { data: numberRows } = await supabaseAdmin
    .from("agent_phone_numbers")
    .select("agent_id, phone_number")
    .order("created_at", { ascending: true });

  const numbersByAgent = new Map<string, string[]>();
  for (const row of numberRows ?? []) {
    const list = numbersByAgent.get(row.agent_id) ?? [];
    list.push(row.phone_number);
    numbersByAgent.set(row.agent_id, list);
  }

  const pending = (agents ?? []).filter(
    (agent) => agent.approval_status === "pending"
  );
  // Rejected registrations stay in the roster so they can be reconsidered,
  // but they're not part of the working team.
  const roster = (agents ?? []).filter(
    (agent) => agent.approval_status !== "pending"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Agents"
        description="Agents register at /register. Approve them here, reset reseller passwords, and manage the team. Each agent connects their own Calendly and outbound number from Settings."
      />

      {error && (
        <p className="text-sm text-red-600">
          Failed to load agents: {error.message}
        </p>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Waiting for approval</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {pending.length}
            </span>
          )}
        </div>
        <Card className="overflow-hidden">
          {pending.length > 0 ? (
            <ul className="divide-y divide-border">
              {pending.map((agent) => (
                <PendingAgentRow
                  key={agent.id}
                  agent={agent as PendingAgent}
                  requestedLabel={formatRelative(agent.created_at)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UserRound}
              title="Nothing waiting"
              description="New registrations from /register land here for you to approve."
            />
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Team</h2>
        <Card className="overflow-hidden">
          {roster.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Customers</th>
                    <th className="px-4 py-3">Calendly</th>
                    <th className="px-4 py-3">Phone number</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {roster.map((agent) => (
                    <AgentRow
                      key={agent.id}
                      agent={{ ...agent, phoneNumbers: numbersByAgent.get(agent.id) ?? [] } as AgentRowData}
                      customerCount={perAgent.get(agent.id) ?? 0}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={UserRound}
              title="No sales agents yet"
              description="Send them to /register — their signup shows up above for approval."
            />
          )}
        </Card>
      </section>
    </div>
  );
}

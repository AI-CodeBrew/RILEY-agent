import { UserRound } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AgentForm } from "./AgentForm";
import { AgentRow, type AgentRowData } from "./AgentRow";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  // Provisioning logins and buying phone numbers is an admin job.
  await requireAdmin();

  const { data: agents, error } = await supabaseAdmin
    .from("sales_agents")
    .select(
      "id, name, email, role, is_active, calendly_url, calendly_user_uri, vapi_phone_number_id, vapi_phone_number, created_at"
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Agents"
        description="Create portal logins, hand each agent their own outbound number, and connect their Calendly so Riley books on their calendar."
        action={<AgentForm />}
      />

      {error && (
        <p className="text-sm text-red-600">
          Failed to load agents: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {agents && agents.length > 0 ? (
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
                {agents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent as AgentRowData}
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
            description="Add your first agent — they'll get a login for this portal."
          />
        )}
      </Card>
    </div>
  );
}

import { UserRound } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AgentForm } from "./AgentForm";
import { AgentRow } from "./AgentRow";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const { data: agents, error } = await supabaseAdmin
    .from("sales_agents")
    .select(
      "id, name, email, calendly_url, calendly_user_uri, vapi_phone_number_id, vapi_phone_number, created_at"
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Agents"
        description="Add agents and connect their Calendly account so the voice agent can book appointments on their calendar."
      />

      <Card className="p-4">
        <AgentForm />
      </Card>

      {error && (
        <p className="text-sm text-red-600">
          Failed to load agents: {error.message}
        </p>
      )}

      <Card className="overflow-hidden">
        {agents && agents.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Calendly</th>
                <th className="px-4 py-3">Phone number</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={UserRound}
            title="No sales agents yet"
            description="Add your first agent using the form above."
          />
        )}
      </Card>
    </div>
  );
}

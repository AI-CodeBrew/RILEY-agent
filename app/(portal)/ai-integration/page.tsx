import { Bot } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AIIntegrationPanel } from "./AIIntegrationPanel";
import { AIIntegrationHistory } from "./AIIntegrationHistory";
import type { AgentAiPreferenceChange } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AIIntegrationPage() {
  const session = await requireSession();

  if (session.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI Integration"
          description="Each agent sets their own voice and script. Sign in as an agent to change these."
        />
        <EmptyState icon={Bot} title="Agents only" description="Admins don't place calls, so there's nothing to configure here." />
      </div>
    );
  }

  const { data: history } = await supabaseAdmin
    .from("agent_ai_preference_changes")
    .select("*")
    .eq("agent_id", session.agent.id)
    .order("changed_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Integration"
        description="Abby's default voice and script for your calls. Call panel, customer list, and campaigns pre-fill from this but can still be changed per call."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-accent" />
            Defaults
          </h2>
          <AIIntegrationPanel
            agent={{
              id: session.agent.id,
              default_voice_gender: session.agent.default_voice_gender,
              default_script: session.agent.default_script,
              retry_delay_minutes: session.agent.retry_delay_minutes,
              retry_window_start: session.agent.retry_window_start,
              retry_window_end: session.agent.retry_window_end,
              retry_max_attempts: session.agent.retry_max_attempts,
            }}
          />
        </Card>

        <Card className="p-5">
          <AIIntegrationHistory
            agentId={session.agent.id}
            timezone={session.agent.timezone}
            initialHistory={(history ?? []) as AgentAiPreferenceChange[]}
          />
        </Card>
      </div>
    </div>
  );
}

import { CalendarCheck, PhoneMissed, PhoneOutgoing, Radio } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { CampaignPanel } from "./CampaignPanel";
import type { CallType, CustomerStatus, DialCampaign } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const session = await requireSession();

  if (session.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Auto-dial"
          description="Agents run campaigns from their own account. Sign in as an agent to start auto-dialing."
        />
        <EmptyState icon={Radio} title="Agents only" description="Admins can view call logs but cannot start campaigns." />
      </div>
    );
  }

  const [{ data: customers }, { data: campaigns }, { data: numberRows }, { data: routeRows }] =
    await Promise.all([
      applyAgentScope(
        supabaseAdmin
          .from("customers")
          .select("id, name, phone, status, call_type")
          .not("status", "eq", "do_not_call")
          .order("name"),
        session
      ),
      applyAgentScope(
        supabaseAdmin.from("dial_campaigns").select("*").order("created_at", { ascending: false }).limit(5),
        session
      ),
      supabaseAdmin
        .from("agent_phone_numbers")
        .select("id, phone_number")
        .eq("agent_id", session.agent.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("agent_number_routes")
        .select("region, phone_number_id")
        .eq("agent_id", session.agent.id),
    ]);

  const numbers = (numberRows ?? []).map((row) => ({ id: row.id, phoneNumber: row.phone_number }));
  const routes = routeRows ?? [];

  const dialable = (customers ?? []).filter(
    (c) => c.status !== "appointment_set" && c.status !== "not_interested"
  );
  const followUpCount = (customers ?? []).filter(
    (c) => c.status === "follow_up" || c.status === "no_answer"
  ).length;
  const bookedCount = (customers ?? []).filter((c) => c.status === "appointment_set").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-dial"
        description="Pick customers, set a calling window, and Abby dials them one by one — no manual trigger per customer."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Dial-ready" value={dialable.length} icon={PhoneOutgoing} />
        <StatCard
          label="Needs follow-up"
          value={followUpCount}
          icon={PhoneMissed}
          tone={followUpCount > 0 ? "warning" : "default"}
          hint="follow up or no answer"
        />
        <StatCard
          label="Booked"
          value={bookedCount}
          icon={CalendarCheck}
          tone={bookedCount > 0 ? "success" : "default"}
        />
      </div>

      <Card className="p-5">
        {dialable.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No customers to dial"
            description="Add customers first, then come back to start a campaign."
          />
        ) : (
          <CampaignPanel
            customers={
              dialable as {
                id: string;
                name: string;
                phone: string;
                status: CustomerStatus;
                call_type: CallType | null;
              }[]
            }
            numbers={numbers}
            routes={routes}
            initialCampaigns={(campaigns ?? []) as DialCampaign[]}
            defaultVoiceGender={session.agent.default_voice_gender}
            agentId={session.agent.id}
            retryDelayMinutes={session.agent.retry_delay_minutes}
            retryWindowStart={session.agent.retry_window_start}
            retryWindowEnd={session.agent.retry_window_end}
            retryMaxAttempts={session.agent.retry_max_attempts}
          />
        )}
      </Card>
    </div>
  );
}

import { Radio } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { CampaignPanel } from "./CampaignPanel";
import type { CampaignStatus, CustomerStatus, DialCampaign } from "@/types/database";

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

  const [{ data: customers }, { data: campaigns }] = await Promise.all([
    applyAgentScope(
      supabaseAdmin
        .from("customers")
        .select("id, name, phone, status")
        .not("status", "eq", "do_not_call")
        .order("name"),
      session
    ),
    applyAgentScope(
      supabaseAdmin.from("dial_campaigns").select("*").order("created_at", { ascending: false }).limit(5),
      session
    ),
  ]);

  const dialable = (customers ?? []).filter(
    (c) => c.status !== "appointment_set" && c.status !== "not_interested"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-dial"
        description="Pick customers, set a calling window, and Abby dials them one by one — no manual trigger per customer."
      />

      <Card className="p-5">
        {dialable.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No customers to dial"
            description="Add customers first, then come back to start a campaign."
          />
        ) : (
          <CampaignPanel
            customers={dialable as { id: string; name: string; phone: string; status: CustomerStatus }[]}
            initialCampaigns={(campaigns ?? []) as DialCampaign[]}
          />
        )}
      </Card>
    </div>
  );
}

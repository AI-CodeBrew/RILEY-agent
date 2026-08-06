import { StickyNote } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NotesTable } from "./NotesTable";
import type { CallWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

type CallRow = CallWithRelations & {
  customer: { id: string; name: string; phone: string } | null;
  transcript?: string | null;
};

export default async function NotesPage() {
  const session = await requireSession();

  const query = applyAgentScope(
    supabaseAdmin
      .from("calls")
      .select(
        "id, created_at, outcome, status, summary, transcript, call_insights, customer:customers(id, name, phone), agent:sales_agents!calls_agent_id_fkey(id, name)"
      )
      .eq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(300),
    session
  );

  const { data, error } = await query;
  const rows = (data ?? []) as CallRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call notes"
        description="Every completed outbound call — notes, summary, and transcript when available."
      />

      {error && (
        <p className="text-sm text-red-600">Could not load call notes: {error.message}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No call notes yet"
          description="After Abby completes outbound calls, structured notes from the script appear here."
        />
      ) : (
        <NotesTable rows={rows} showAgent={session.isAdmin} timezone={session.agent.timezone} />
      )}
    </div>
  );
}

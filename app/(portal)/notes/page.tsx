import { StickyNote } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireSession } from "@/lib/auth";
import { redactCustomerForSession } from "@/lib/customer-visibility";
import { notePreview, parseCallInsights } from "@/lib/call-notes";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NotesTable } from "./NotesTable";
import type { CallWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";

type CallRow = CallWithRelations & {
  customer: { id: string; name: string; phone?: string } | null;
  transcript?: string | null;
};

export default async function NotesPage() {
  const session = await requireSession();

  // transcript is deliberately excluded here — notePreview() only ever falls
  // back to it when a call has no key_notes, no structured insight fields,
  // and no summary, which is rare. Fetching the full transcript column for
  // every one of up to 300 rows just to maybe use it for one row is the
  // biggest single over-fetch in the portal, since transcripts can run many
  // KB each. Rows that actually need it are backfilled below, individually.
  const query = applyAgentScope(
    supabaseAdmin
      .from("calls")
      .select(
        "id, created_at, outcome, status, summary, call_insights, customer:customers(id, name, phone), agent:sales_agents!calls_agent_id_fkey(id, name)"
      )
      .eq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(300),
    session
  );

  const { data, error } = await query;
  let rows = ((data ?? []) as CallRow[]).map((row) => ({
    ...row,
    customer: row.customer ? redactCustomerForSession(row.customer, session) : null,
  }));

  // Only the rows notePreview() would otherwise render blank need a
  // transcript at all — fetch it for just that (normally small) subset in
  // one follow-up query, instead of loading it for the whole list.
  const idsNeedingTranscript = rows
    .filter((row) => !notePreview(parseCallInsights(row.call_insights), row.summary))
    .map((row) => row.id);

  if (idsNeedingTranscript.length > 0) {
    const { data: transcriptRows } = await supabaseAdmin
      .from("calls")
      .select("id, transcript")
      .in("id", idsNeedingTranscript);

    const transcriptById = new Map(
      (transcriptRows ?? []).map((r) => [r.id, r.transcript])
    );
    rows = rows.map((row) =>
      transcriptById.has(row.id)
        ? { ...row, transcript: transcriptById.get(row.id) ?? null }
        : row
    );
  }

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

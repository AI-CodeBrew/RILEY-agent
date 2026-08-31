import { MessageSquareWarning } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { UnreviewedRebuttalRow, type UnreviewedRebuttal } from "./UnreviewedRebuttalRow";
import type { CallType } from "@/types/database";

export const dynamic = "force-dynamic";

const SCRIPT_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

export default async function RebuttalsPage() {
  const session = await requireSession();

  // Admins place no calls, so they never generate or review rebuttals — see
  // the migration's header comment. Same pattern as app/(portal)/ai-integration.
  if (session.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Rebuttals"
          description="Each agent reviews the objections their own calls surfaced. Sign in as an agent to see this."
        />
        <EmptyState
          icon={MessageSquareWarning}
          title="Agents only"
          description="Admins don't place calls, so there's nothing to review here."
        />
      </div>
    );
  }

  const { data: rebuttals, error } = await supabaseAdmin
    .from("rebuttals")
    .select("id, script, objection_text, answer_text, status, times_matched, created_at")
    .eq("agent_id", session.agent.id)
    .order("created_at", { ascending: false });

  const unreviewed = (rebuttals ?? []).filter((r) => r.status === "unreviewed");
  const reviewed = (rebuttals ?? []).filter((r) => r.status !== "unreviewed").slice(0, 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rebuttals"
        description="When a call hits an objection outside the script, Abby answers on the spot and logs it here. Approve it (editing if needed) to make it the standard answer on every future call for this script."
      />

      {error && (
        <p className="text-sm text-red-600">Failed to load rebuttals: {error.message}</p>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Waiting for your review</h2>
          {unreviewed.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {unreviewed.length}
            </span>
          )}
        </div>
        <Card className="overflow-hidden">
          {unreviewed.length > 0 ? (
            <ul className="divide-y divide-border">
              {unreviewed.map((rebuttal) => (
                <UnreviewedRebuttalRow
                  key={rebuttal.id}
                  rebuttal={rebuttal as UnreviewedRebuttal}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={MessageSquareWarning}
              title="Nothing waiting"
              description="New objections your calls hit outside the script will land here."
            />
          )}
        </Card>
      </section>

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Recently reviewed</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {reviewed.map((rebuttal) => (
                <li key={rebuttal.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="rounded-full bg-background px-2 py-0.5 font-medium">
                        {SCRIPT_LABELS[rebuttal.script as CallType]}
                      </span>
                      <span>{formatRelative(rebuttal.created_at)}</span>
                      {rebuttal.status === "approved" && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Approved{rebuttal.times_matched > 0 ? ` · used ${rebuttal.times_matched}×` : ""}
                        </span>
                      )}
                      {rebuttal.status === "rejected" && (
                        <span className="text-muted">Rejected</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm">{rebuttal.objection_text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyAgentScope, requireApiSession } from "@/lib/auth";
import { DASHBOARD_WINDOW_DAYS, OUTCOME_LABELS } from "@/lib/call-outcomes";
import type { CallOutcome } from "@/types/database";

/**
 * Exports the dashboard's "Call outcomes" card as CSV — completed calls in
 * the last 7 days, counted per outcome, with the same agent scoping as
 * app/(portal)/dashboard/page.tsx. Counts, not rows, so the numbers stay
 * exact past PostgREST's 1000-row cap.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const agentFilter = new URL(request.url).searchParams.get("agent") ?? undefined;
  const now = Date.now();
  const windowStart = new Date(now - DASHBOARD_WINDOW_DAYS * 86_400_000).toISOString();

  function finishedCallsCount() {
    return applyAgentScope(
      supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("status", "ended")
        .gte("created_at", windowStart),
      session,
      { requestedAgentId: agentFilter }
    );
  }

  const outcomeKeys = Object.keys(OUTCOME_LABELS);
  const [total, ...perOutcome] = await Promise.all([
    finishedCallsCount(),
    ...outcomeKeys.map((key) =>
      finishedCallsCount().eq("outcome", key as NonNullable<CallOutcome>)
    ),
  ]);

  const error = total.error ?? perOutcome.find((result) => result.error)?.error ?? null;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = outcomeKeys.map(
    (key, index) => `${OUTCOME_LABELS[key]},${perOutcome[index].count ?? 0}`
  );
  const csv = ["outcome,calls", ...rows, `Total completed calls,${total.count ?? 0}`].join("\n");

  const today = new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeZone: session.agent.timezone,
  }).format(new Date(now));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="call-outcomes-last-${DASHBOARD_WINDOW_DAYS}-days-${today}.csv"`,
    },
  });
}

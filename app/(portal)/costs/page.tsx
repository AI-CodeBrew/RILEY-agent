import Link from "next/link";
import { DollarSign, Phone, Scale } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth";
import { formatCost } from "@/lib/format";
import { parseDateRangeFilter } from "@/lib/date-range";
import { getCostReport, type CostReport } from "@/lib/vapi-cost";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { DateRangeFilter } from "@/components/Filters";
import { CostFilters, type RangePreset } from "./CostFilters";
import { SyncCostsButton } from "./SyncCostsButton";

export const dynamic = "force-dynamic";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" from parts that may run past either end of their month or year (day 0 = last day of the month before). */
function ymd(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** One-click ranges, in the admin's own timezone. "Last N days" includes today. */
function rangePresets(timeZone: string): RangePreset[] {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);

  return [
    { label: "All time", from: null, to: null },
    { label: "Last 7 days", from: ymd(year, month, day - 6), to: today },
    { label: "Last 14 days", from: ymd(year, month, day - 13), to: today },
    { label: "Last 30 days", from: ymd(year, month, day - 29), to: today },
    { label: "This month", from: ymd(year, month, 1), to: today },
    { label: "Last month", from: ymd(year, month - 1, 1), to: ymd(year, month, 0) },
    { label: "Last 3 months", from: ymd(year, month - 2, 1), to: today },
  ];
}

/** "2026-10" → "October 2026". */
function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 15)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; from?: string; to?: string }>;
}) {
  const session = await requireAdmin();
  const { agent: agentParam, from, to } = await searchParams;
  const timeZone = session.agent.timezone;

  const { data: agents, error: agentsError } = await supabaseAdmin
    .from("sales_agents")
    .select("id, name")
    .eq("role", "agent")
    .order("name");

  const selected = (agents ?? []).find((agent) => agent.id === agentParam) ?? null;
  const { startUtc, endUtc } = parseDateRangeFilter(from, to, timeZone);

  let report: CostReport | null = null;
  let reportError: string | null = null;
  try {
    report = await getCostReport({ agentId: selected?.id ?? null, startUtc, endUtc, timeZone });
  } catch (error) {
    reportError = error instanceof Error ? error.message : "Failed to load costs.";
  }

  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  const rangeLabel = from || to ? `${from ?? "start"} to ${to ?? "today"}` : "all time";

  function agentHref(agentId: string) {
    const params = new URLSearchParams({ agent: agentId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/costs?${params}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vapi Costs"
        description="What each agent's calls cost on Vapi — for the last 7, 14 or 30 days, by month, or any dates you pick."
        action={<SyncCostsButton />}
      />

      {(agentsError || reportError) && (
        <p className="text-sm text-red-600">
          {reportError ?? `Failed to load agents: ${agentsError?.message}`}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <CostFilters agents={agents ?? []} presets={rangePresets(timeZone)} />
        <DateRangeFilter />
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={`${selected?.name ?? "All agents"} · Vapi cost`}
              value={formatCost(report.cost)}
              icon={DollarSign}
              hint={rangeLabel}
            />
            <StatCard
              label="Calls"
              value={report.calls.toLocaleString()}
              icon={Phone}
              hint={rangeLabel}
            />
            <StatCard
              label="Average per call"
              value={report.calls > 0 ? `$${(report.cost / report.calls).toFixed(3)}` : "—"}
              icon={Scale}
            />
          </div>

          {report.calls === 0 ? (
            <Card>
              <EmptyState
                icon={DollarSign}
                title="No calls in that range"
                description={`${selected?.name ?? "Nobody"} placed any Vapi calls for ${rangeLabel}.`}
              />
            </Card>
          ) : (
            <>
              {!selected && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold">By agent</h2>
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                          <tr>
                            <th className="px-4 py-3">Agent</th>
                            <th className="px-4 py-3">Calls</th>
                            <th className="px-4 py-3">Vapi cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.agents.map((row) => {
                            const name = row.agentId ? names.get(row.agentId) : undefined;
                            return (
                              <tr
                                key={row.agentId ?? "deleted"}
                                className="border-b border-border last:border-0 hover:bg-background"
                              >
                                <td className="px-4 py-3 font-medium">
                                  {row.agentId && name ? (
                                    <Link href={agentHref(row.agentId)} className="hover:underline">
                                      {name}
                                    </Link>
                                  ) : (
                                    <span className="text-muted">Deleted or admin account</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-muted">{row.calls.toLocaleString()}</td>
                                <td className="px-4 py-3">{formatCost(row.cost)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </section>
              )}

              <section>
                <h2 className="mb-3 text-sm font-semibold">By month</h2>
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-4 py-3">Month</th>
                          <th className="px-4 py-3">Calls</th>
                          <th className="px-4 py-3">Vapi cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.months.map((row) => (
                          <tr
                            key={row.month}
                            className="border-b border-border last:border-0 hover:bg-background"
                          >
                            <td className="px-4 py-3 font-medium">{monthLabel(row.month)}</td>
                            <td className="px-4 py-3 text-muted">{row.calls.toLocaleString()}</td>
                            <td className="px-4 py-3">{formatCost(row.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-border font-semibold">
                        <tr>
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3">{report.calls.toLocaleString()}</td>
                          <td className="px-4 py-3">{formatCost(report.cost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              </section>
            </>
          )}
        </>
      )}

      <p className="text-xs text-muted">
        Each call&apos;s cost is saved from Vapi when the call ends and re-checked against Vapi
        every hour, so these totals stay available after Vapi drops the call itself (about two
        weeks). Twilio charges are billed separately and aren&apos;t included.
      </p>
    </div>
  );
}

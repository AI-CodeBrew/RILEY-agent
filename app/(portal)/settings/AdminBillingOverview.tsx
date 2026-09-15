"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, CircleDashed, Hourglass, Gift } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { BillingAccount, BillingPlan } from "@/types/database";

const PLAN_LABEL: Record<BillingPlan, string> = {
  trial: "Free trial",
  standard: "Standard",
  with_calendar: "Pro",
};

const PLANS: BillingPlan[] = ["trial", "standard", "with_calendar"];

/**
 * Admins observe each agent's own subscription here (no Stripe customer/
 * subscription id shown), and — pre-launch only, see lib/billing.ts::
 * grantFreePlan — can hand an agent a plan for free, bypassing Stripe
 * entirely. Agents otherwise subscribe and cancel only for themselves, from
 * their own Settings page (see BillingPanel). An agent who's never started a
 * subscription still gets a row here, with no plan/status data, so admins
 * can see who hasn't subscribed yet.
 */
export function AdminBillingOverview({
  accounts,
  planMinuteCap,
  trialMinuteCap,
}: {
  accounts: Array<{
    agent: { id: string; name: string; email: string };
    account: BillingAccount | null;
    usedHours: number;
  }>;
  /** Mirrors lib/billing.ts's PLAN_MINUTE_CAP — passed down rather than imported since lib/billing.ts pulls in the server-only supabaseAdmin client. */
  planMinuteCap: Record<"standard" | "with_calendar", number>;
  /** Mirrors lib/billing.ts's TRIAL_MINUTE_CAP — same reasoning as planMinuteCap. */
  trialMinuteCap: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<string, BillingPlan>>({});

  async function grant(agentId: string) {
    setPendingAgentId(agentId);
    const res = await fetch("/api/billing/admin-grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, plan: selectedPlan[agentId] ?? "standard" }),
    });
    const body = await res.json().catch(() => ({}));
    setPendingAgentId(null);

    if (!res.ok) {
      toast(body.error ?? "Could not grant a free plan.", "error");
      return;
    }
    toast("Free plan granted.", "success");
    router.refresh();
  }

  async function revoke(agentId: string) {
    setPendingAgentId(agentId);
    const res = await fetch("/api/billing/admin-grant", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    const body = await res.json().catch(() => ({}));
    setPendingAgentId(null);

    if (!res.ok) {
      toast(body.error ?? "Could not revoke the free plan.", "error");
      return;
    }
    toast("Free plan revoked.", "success");
    router.refresh();
  }

  if (accounts.length === 0) {
    return <p className="text-sm text-muted">No agents yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Granting a free plan skips Stripe entirely — no card, no charge. Meant
        for before real paying users exist; remove this once they do.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Plan</th>
              <th className="py-2 pr-4">Usage</th>
              <th className="py-2 pr-4">Renews / trial ends</th>
              <th className="py-2">Free plan</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(({ agent, account, usedHours }) => {
              const isTrial = account?.plan === "trial";
              const trialExpired =
                isTrial && account?.trial_ends_at && new Date(account.trial_ends_at) <= new Date();
              const isPending = pendingAgentId === agent.id;
              const isGranted = account?.granted_by_admin ?? false;
              return (
                <tr key={agent.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4">
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-xs text-muted">{agent.email}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusPill status={account?.status ?? null} trialExpired={Boolean(trialExpired)} />
                  </td>
                  <td className="py-2.5 pr-4 text-muted">
                    {account?.plan ? PLAN_LABEL[account.plan] : "—"}
                    {isGranted && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-accent">
                        <Gift className="h-3 w-3" />
                        free
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-muted">
                    {!account
                      ? "—"
                      : isTrial
                        ? `${Math.round(usedHours * 60)} / ${trialMinuteCap} min`
                        : `${Math.round(usedHours * 60)} / ${
                            planMinuteCap[(account.plan ?? "standard") as "standard" | "with_calendar"]
                          } min`}
                  </td>
                  <td className="py-2.5 pr-4 text-muted">
                    {isTrial
                      ? account?.trial_ends_at
                        ? new Date(account.trial_ends_at).toLocaleDateString()
                        : "—"
                      : account?.current_period_end
                        ? new Date(account.current_period_end).toLocaleDateString()
                        : "—"}
                  </td>
                  <td className="py-2.5">
                    {isGranted ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={isPending}
                        onClick={() => revoke(agent.id)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedPlan[agent.id] ?? "standard"}
                          onChange={(e) =>
                            setSelectedPlan((current) => ({
                              ...current,
                              [agent.id]: e.target.value as BillingPlan,
                            }))
                          }
                          disabled={isPending}
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
                        >
                          {PLANS.map((plan) => (
                            <option key={plan} value={plan}>
                              {PLAN_LABEL[plan]}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={isPending}
                          onClick={() => grant(agent.id)}
                        >
                          Grant free
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  trialExpired,
}: {
  status: BillingAccount["status"] | null;
  trialExpired: boolean;
}) {
  if (trialExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Hourglass className="h-3.5 w-3.5" />
        Trial ended
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Active
      </span>
    );
  }
  if (status === "past_due") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Payment failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
      <CircleDashed className="h-3.5 w-3.5" />
      {status === "canceled" ? "Canceled" : "Not subscribed"}
    </span>
  );
}

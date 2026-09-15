"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, AlertTriangle, Hourglass } from "lucide-react";
import { Button, LinkButton } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { BillingPlan, BillingStatus } from "@/types/database";

const PLAN_LABEL: Record<BillingPlan, string> = {
  trial: "Free trial",
  standard: "Standard",
  with_calendar: "Pro",
};

/**
 * Per-agent billing controls — each agent subscribes for and manages their
 * own calling, not the whole team sharing one account. Card entry itself
 * never happens here — the "Manage billing" button redirects the whole page
 * to Stripe's hosted Billing Portal; choosing a plan for the first time
 * happens on the dedicated /plans page instead of inline here, so this
 * component only ever sees a plan name and a status, never card data or a
 * price.
 */
export function BillingPanel({
  status,
  plan,
  currentPeriodEnd,
  trialEndsAt,
  usedSeconds,
  capSeconds,
  grantedByAdmin,
}: {
  status: BillingStatus;
  plan: BillingPlan | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  usedSeconds: number;
  capSeconds: number;
  /** True when an admin granted this plan for free (lib/billing.ts::grantFreePlan) rather than the agent paying through Stripe — there's no Stripe customer behind it, so the portal button doesn't apply. */
  grantedByAdmin: boolean;
}) {
  const toast = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);

  async function openPortal() {
    setOpeningPortal(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body.error ?? "Could not open billing portal.", "error");
      setOpeningPortal(false);
      return;
    }
    window.location.href = body.url;
  }

  const isTrial = plan === "trial";
  const usageRatio = capSeconds > 0 ? Math.min(usedSeconds / capSeconds, 1) : 0;
  // Just a display countdown, not something correctness depends on — the
  // real 7-day cutoff is enforced server-side in lib/billing.ts's
  // callBlockReason, which is what actually blocks calling.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const trialDaysLeft =
    isTrial && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / 86_400_000))
      : null;
  const trialExpired = isTrial && trialDaysLeft === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "active" && !trialExpired ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Active{plan ? ` — ${PLAN_LABEL[plan]}` : ""}
            {grantedByAdmin ? " (free, granted by admin)" : ""}
          </span>
        ) : trialExpired ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Hourglass className="h-3.5 w-3.5" />
            Free trial ended
          </span>
        ) : status === "past_due" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Payment failed — update your card
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
            <CircleDashed className="h-3.5 w-3.5" />
            No active subscription
          </span>
        )}
      </div>

      {status === "active" && !trialExpired && (
        <div className="space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${usageRatio * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted">
            {isTrial ? (
              <>
                {Math.round(usedSeconds / 60)} of {Math.round(capSeconds / 60)} trial minutes
                used
                {trialDaysLeft !== null && ` — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
                . Card required, but you won&apos;t be charged during the trial.
              </>
            ) : (
              <>
                {Math.round(usedSeconds / 60)} of {Math.round(capSeconds / 60)} call
                minutes used this billing period
                {currentPeriodEnd &&
                  ` — renews ${new Date(currentPeriodEnd).toLocaleDateString()}`}
                . No overage charges — calls pause once the cap is reached.
              </>
            )}
          </p>
        </div>
      )}

      {status === "active" && !trialExpired ? (
        grantedByAdmin ? null : (
          <Button variant="secondary" onClick={openPortal} loading={openingPortal}>
            Manage billing
          </Button>
        )
      ) : status === "past_due" ? (
        <Button variant="secondary" onClick={openPortal} loading={openingPortal}>
          Update payment method
        </Button>
      ) : (
        <LinkButton href="/plans" variant="primary" size="md">
          {trialExpired ? "Choose a paid plan" : "Choose a plan"}
        </LinkButton>
      )}
    </div>
  );
}

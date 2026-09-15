"use client";

import { useState } from "react";
import { Sparkles, Crown, Gift } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { BillingPlan } from "@/types/database";
import { PlanCard, type PlanDef } from "./PlanCard";

const PLAN_DEFS: PlanDef[] = [
  {
    plan: "trial",
    name: "Free trial",
    price: "$0",
    priceNote: "for 7 days",
    minutesLine: "20 minutes of calling included",
    icon: Gift,
    cta: "Start free trial",
  },
  {
    plan: "standard",
    name: "Standard",
    price: "$549",
    priceNote: "/ month",
    minutesLine: "3000 minutes of calling / month",
    icon: Sparkles,
    excludes: ["Calendar"],
    cta: "Subscribe — Standard",
  },
  {
    plan: "with_calendar",
    name: "Pro",
    price: "$699",
    priceNote: "/ month",
    minutesLine: "4000 minutes of calling / month",
    icon: Crown,
    badge: "Most popular",
    cta: "Subscribe — Pro",
  },
];

export function PlansGrid({ trialUsed }: { trialUsed: boolean }) {
  const toast = useToast();
  const [starting, setStarting] = useState<BillingPlan | null>(null);

  async function startCheckout(plan: BillingPlan) {
    setStarting(plan);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body.error ?? "Could not start checkout.", "error");
      setStarting(null);
      return;
    }
    window.location.href = body.url;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {PLAN_DEFS.map((def) => (
        <PlanCard
          key={def.plan}
          def={def}
          trialUsed={trialUsed}
          starting={starting}
          onStart={startCheckout}
        />
      ))}
    </div>
  );
}

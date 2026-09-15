import type { LucideIcon } from "lucide-react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import type { BillingPlan } from "@/types/database";

export const FEATURES = [
  "Customers",
  "Auto-dial",
  "Appointments & calls",
  "Call notes",
  "Calendar",
  "AI Integration",
  "Settings",
] as const;

export interface PlanDef {
  plan: BillingPlan;
  name: string;
  price: string;
  priceNote: string;
  minutesLine: string;
  icon: LucideIcon;
  badge?: string;
  excludes?: (typeof FEATURES)[number][];
  cta: string;
}

export function PlanCard({
  def,
  trialUsed,
  starting,
  onStart,
}: {
  def: PlanDef;
  trialUsed: boolean;
  /** Which plan (if any) currently has a checkout request in flight — drives every card's disabled/loading state, not just its own. */
  starting: BillingPlan | null;
  onStart: (plan: BillingPlan) => void;
}) {
  const Icon = def.icon;
  const isTrial = def.plan === "trial";
  const disabled = isTrial && trialUsed;

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-5 border-2 p-7 transition-shadow",
        def.badge
          ? "border-accent shadow-lg shadow-accent/10"
          : "border-border hover:shadow-md"
      )}
    >
      {def.badge && (
        <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground shadow-sm">
          {def.badge}
        </span>
      )}

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            def.badge ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">{def.name}</h2>
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-tight">{def.price}</span>
          <span className="text-sm text-muted">{def.priceNote}</span>
        </div>
        <p className="mt-1.5 text-sm font-medium text-accent">{def.minutesLine}</p>
      </div>

      <ul className="flex-1 space-y-2.5">
        {FEATURES.map((feature) => {
          const excluded = def.excludes?.includes(feature);
          return (
            <li
              key={feature}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                excluded ? "text-muted line-through" : "text-foreground"
              )}
            >
              {excluded ? (
                <X className="h-4 w-4 shrink-0 text-muted" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              {feature}
            </li>
          );
        })}
      </ul>

      {isTrial && (
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
          Card required to start — you won&apos;t be charged during the trial.
          {trialUsed && " You've already used your free trial."}
        </p>
      )}

      <Button
        variant={def.badge ? "primary" : "secondary"}
        size="md"
        className="w-full justify-center"
        loading={starting === def.plan}
        disabled={disabled || starting !== null}
        onClick={() => onStart(def.plan)}
      >
        {disabled ? "Trial already used" : def.cta}
      </Button>
    </Card>
  );
}

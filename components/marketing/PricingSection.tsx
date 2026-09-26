import { Check, X, Gift, Sparkles, Crown } from "lucide-react";
import { FEATURES } from "@/app/plans/PlanCard";

const PLANS = [
  {
    name: "Free trial",
    price: "$0",
    priceNote: "for 7 days",
    minutesLine: "20 minutes of calling included",
    icon: Gift,
    excludes: [] as (typeof FEATURES)[number][],
    note: "Card required to start — you won't be charged during the trial.",
  },
  {
    name: "Standard",
    price: "$549",
    priceNote: "/ month",
    minutesLine: "3000 minutes of calling / month",
    icon: Sparkles,
    excludes: ["Calendar"] as (typeof FEATURES)[number][],
  },
  {
    name: "Pro",
    price: "$699",
    priceNote: "/ month",
    minutesLine: "4000 minutes of calling / month",
    icon: Crown,
    badge: "Most popular",
    excludes: [] as (typeof FEATURES)[number][],
  },
];

/**
 * Display-only pricing on the landing page (#pricing).
 * No Stripe checkout here — agents subscribe after signing in via /plans.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold tracking-widest text-[var(--lp-accent)]">
            PRICING
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Simple plans for every team.
          </h2>
          <p className="mt-4 text-[var(--lp-muted)]">
            See what each plan includes. Checkout and billing happen after you
            create an account — you can&apos;t buy from this page.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col gap-5 rounded-2xl border p-7 ${
                  plan.badge
                    ? "border-[var(--lp-blue)] bg-[var(--lp-bg-soft)] shadow-lg shadow-[var(--lp-blue)]/10"
                    : "border-[var(--lp-border)] bg-[var(--lp-bg-soft)]/60"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-7 rounded-full bg-[var(--lp-blue)] px-3 py-1 text-xs font-semibold text-white">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      plan.badge
                        ? "bg-[var(--lp-blue)] text-white"
                        : "bg-[var(--lp-blue)]/15 text-[var(--lp-accent)]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--lp-text)]">
                    {plan.name}
                  </h3>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight text-[var(--lp-text)]">
                      {plan.price}
                    </span>
                    <span className="text-sm text-[var(--lp-muted)]">
                      {plan.priceNote}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-[var(--lp-accent)]">
                    {plan.minutesLine}
                  </p>
                </div>

                <ul className="flex-1 space-y-2.5">
                  {FEATURES.map((feature) => {
                    const excluded = plan.excludes.includes(feature);
                    return (
                      <li
                        key={feature}
                        className={`flex items-center gap-2.5 text-sm ${
                          excluded
                            ? "text-[var(--lp-muted)] line-through"
                            : "text-[var(--lp-text)]"
                        }`}
                      >
                        {excluded ? (
                          <X className="h-4 w-4 shrink-0 text-[var(--lp-muted)]" />
                        ) : (
                          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        )}
                        {feature}
                      </li>
                    );
                  })}
                </ul>

                {plan.note && (
                  <p className="rounded-lg border border-[var(--lp-border)] bg-black/20 px-3 py-2 text-xs text-[var(--lp-muted)]">
                    {plan.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

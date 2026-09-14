import { PhoneCall, UserCheck, CalendarCheck, CalendarDays, ArrowRight, ArrowDown } from "lucide-react";

const STEPS = [
  { icon: PhoneCall, label: "AI Call" },
  { icon: UserCheck, label: "Lead Qualified" },
  { icon: CalendarCheck, label: "Appointment Booked" },
  { icon: CalendarDays, label: "Calendar" },
];

export function HeroFlow() {
  return (
    <section className="relative px-6 pb-16 sm:pb-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.label} className="flex flex-col items-center gap-3 sm:contents">
              <div className="flex w-28 flex-col items-center gap-2.5 text-center">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-bg-soft)] text-[var(--lp-accent)]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-[var(--lp-text)]">
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <>
                  <ArrowDown className="h-4 w-4 shrink-0 text-[var(--lp-muted)] sm:hidden" aria-hidden />
                  <div className="hidden h-12 shrink-0 items-center sm:flex">
                    <ArrowRight className="h-4 w-4 text-[var(--lp-muted)]" aria-hidden />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

import { Users, Phone, MessageSquare, BarChart3, Settings } from "lucide-react";
import { FeatureCarousel } from "./FeatureCarousel";

const FEATURES = [
  {
    icon: Users,
    title: "Client Management",
    description:
      "Store, organize, and manage every borrower profile — loan type, documents, and history — in one secure place.",
    chip: "bg-[var(--lp-blue)]/10 text-[var(--lp-blue)]",
    border: "border-[var(--lp-blue)]/20 hover:border-[var(--lp-blue)]/40",
    shadow: "hover:shadow-blue-500/15",
  },
  {
    icon: Phone,
    title: "Voice Agent",
    description:
      "AI-powered voice agents handle inbound calls, follow-ups, and appointment booking 24/7.",
    chip: "bg-violet-500/10 text-violet-600",
    border: "border-violet-500/20 hover:border-violet-500/40",
    shadow: "hover:shadow-violet-500/15",
  },
  {
    icon: MessageSquare,
    title: "Multi-Channel Reach",
    description:
      "Connect with clients via calls, SMS, email, and chat — all from one unified inbox.",
    chip: "bg-emerald-500/10 text-emerald-600",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    shadow: "hover:shadow-emerald-500/15",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description:
      "Get real-time insight into bookings, call outcomes, and spend to make data-driven decisions.",
    chip: "bg-amber-500/10 text-amber-600",
    border: "border-amber-500/20 hover:border-amber-500/40",
    shadow: "hover:shadow-amber-500/15",
  },
  {
    icon: Settings,
    title: "Automation",
    description:
      "Automate follow-ups, tasks, and workflows to save time and close more loans.",
    chip: "bg-rose-500/10 text-rose-600",
    border: "border-rose-500/20 hover:border-rose-500/40",
    shadow: "hover:shadow-rose-500/15",
  },
];

export function PlatformFeatures() {
  return (
    <section id="platform" className="bg-[var(--lp-light-bg)] px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <span className="inline-flex items-center rounded-full bg-[var(--lp-blue)]/10 px-4 py-1.5 text-xs font-semibold text-[var(--lp-blue)]">
            Everything You Need
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--lp-light-text)] sm:text-4xl">
            One platform. Endless possibilities.
          </h2>
          <p className="mt-4 text-[var(--lp-light-muted)]">
            Dialcom brings your leads, clients, calls, and automation
            together — so nothing slips through the pipeline.
          </p>
        </div>

        <FeatureCarousel>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`flex h-full min-h-[240px] flex-col rounded-2xl border bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${feature.border} ${feature.shadow}`}
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.chip}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-[var(--lp-light-text)]">
                  {feature.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--lp-light-muted)]">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </FeatureCarousel>
      </div>
    </section>
  );
}

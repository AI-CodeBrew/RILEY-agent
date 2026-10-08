const STATS = [
  { value: "15,000+", label: "Leads managed" },
  { value: "100+", label: "Clients" },
  { value: "23%", label: "Avg. booking rate" },
  { value: "24/7", label: "Voice Agent uptime" },
];

export function StatsBar() {
  return (
    <section className="bg-[var(--lp-light-bg)] px-6 py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="text-3xl font-bold tracking-tight text-[var(--lp-light-text)]">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-[var(--lp-light-muted)]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

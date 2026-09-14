import { Check, Phone } from "lucide-react";

const BARS = [40, 62, 30, 78, 54, 90, 46];

function DashboardMockup({ imageUrl }: { imageUrl?: string | null }) {
  // The uploaded screenshot is a light dashboard UI — match the floating
  // cards to it instead of the dark theme the CSS-mockup fallback uses.
  const light = Boolean(imageUrl);
  const cardBg = light
    ? "border-[var(--lp-light-border)] bg-white"
    : "border-[var(--lp-border)] bg-[var(--lp-bg-soft-2)]";
  const cardLabel = light ? "text-[var(--lp-light-muted)]" : "text-[var(--lp-muted)]";
  const cardTitle = light ? "text-[var(--lp-light-text)]" : "text-[var(--lp-text)]";
  const iconChip = light
    ? "bg-[var(--lp-blue)]/10 text-[var(--lp-blue)]"
    : "bg-[var(--lp-blue)]/20 text-[var(--lp-accent)]";

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg-soft)] shadow-2xl">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary remote URL
          <img src={imageUrl} alt="Dialcom dashboard" className="block w-full h-auto" />
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-b border-[var(--lp-border)] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-3 rounded-md bg-black/20 px-3 py-1 text-[11px] text-[var(--lp-muted)]">
                app.dialcom.ai/dashboard
              </span>
            </div>
            <div className="grid grid-cols-[auto,1fr]">
              <div className="hidden w-32 flex-col gap-2 border-r border-[var(--lp-border)] p-4 sm:flex">
                {["Overview", "Clients", "Voice Agent", "Pipeline", "Reports"].map(
                  (item, i) => (
                    <span
                      key={item}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] ${
                        i === 0
                          ? "bg-[var(--lp-blue)]/20 text-[var(--lp-accent)]"
                          : "text-[var(--lp-muted)]"
                      }`}
                    >
                      {item}
                    </span>
                  )
                )}
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-[var(--lp-muted)]">
                  Welcome back, Dial
                </p>
                <div className="mt-4 flex items-end gap-2.5">
                  {BARS.map((h, i) => (
                    <div
                      key={i}
                      className="w-6 rounded-md bg-gradient-to-t from-[var(--lp-blue)] to-[var(--lp-accent)] sm:w-8"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex gap-2.5 text-[10px] text-[var(--lp-muted)]">
                  <span className="w-6 text-center sm:w-8">9AM</span>
                  <span className="w-6 text-center sm:w-8">10AM</span>
                  <span className="w-6 text-center sm:w-8">11AM</span>
                  <span className="w-6 text-center sm:w-8">12PM</span>
                  <span className="w-6 text-center sm:w-8">1PM</span>
                  <span className="w-6 text-center sm:w-8">2PM</span>
                  <span className="w-6 text-center sm:w-8">3PM</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`absolute -top-6 right-2 hidden w-40 rounded-xl border p-3.5 shadow-xl sm:block sm:right-6 ${cardBg}`}>
        <p className={`text-[11px] ${cardLabel}`}>Loans Funded</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-xl font-bold ${cardTitle}`}>78</span>
          <span className="text-xs font-semibold text-emerald-500">18%</span>
        </div>
      </div>

      <div className={`absolute -bottom-8 -left-4 flex w-56 items-center gap-3 rounded-xl border p-3.5 shadow-xl sm:-left-10 ${cardBg}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconChip}`}>
          <Phone className="h-4 w-4" />
        </span>
        <div>
          <p className={`text-xs font-semibold ${cardTitle}`}>Voice Agent</p>
          <p className={`text-[11px] ${cardLabel}`}>Booking a call now...</p>
        </div>
      </div>
    </div>
  );
}

export function Hero({ heroImageUrl }: { heroImageUrl?: string | null }) {
  return (
    <section className="relative overflow-hidden">
      <div className="landing-grid" aria-hidden />
      <div
        className="landing-glow -left-32 -top-32 h-96 w-96 bg-[#d94f8c]/20"
        aria-hidden
      />
      <div
        className="landing-glow -right-40 top-24 h-[28rem] w-[28rem] bg-[#4c5df0]/25"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-border)] bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--lp-muted)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            All-in-One CRM + Voice AI for Lenders
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            Book.
            <br />
            Meet.
            <br />
            <span className="text-[var(--lp-accent)]">Connect.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base text-[var(--lp-muted)] sm:text-lg">
            Dialcom brings your leads, clients, and calls into one CRM — with
            an AI voice agent that qualifies borrowers and books appointments
            around the clock.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--lp-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" /> No credit card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" /> Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" /> Live in under a
              day
            </span>
          </div>
        </div>

        <div className="min-w-0 pb-8 pt-6">
          <DashboardMockup imageUrl={heroImageUrl} />
        </div>
      </div>
    </section>
  );
}

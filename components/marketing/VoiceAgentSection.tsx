import { Check } from "lucide-react";
import { LiveCallButton } from "./LiveCallButton";

const WAVEFORM = [8, 16, 26, 14, 32, 20, 40, 24, 12, 30, 18, 36, 22, 10, 28, 16];

const CHECKLIST = [
  "Answers inbound calls and qualifies borrowers in seconds",
  "Books appointments straight onto your calendar",
  "Follows up automatically until a lead responds",
];

function LiveCallMockup() {
  return (
    <div className="rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg-soft)] p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--lp-text)]">Voice Agent</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <div className="mt-6 flex h-20 items-end gap-1.5">
        {WAVEFORM.map((h, i) => (
          <div
            key={i}
            className="w-2 flex-1 rounded-full bg-[var(--lp-accent)]/70"
            style={{ height: `${h * 2}px` }}
          />
        ))}
      </div>

      <div className="mt-6 space-y-3 border-t border-[var(--lp-border)] pt-5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--lp-muted)]">Caller</span>
          <span className="font-semibold text-[var(--lp-text)]">Salman Zafar</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--lp-muted)]">Loan type</span>
          <span className="font-semibold text-[var(--lp-text)]">
            Personal Loan · $25,000
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--lp-muted)]">Outcome</span>
          <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            Pre-Approved
          </span>
        </div>
      </div>
    </div>
  );
}

export function VoiceAgentSection({ liveCallAudioUrl }: { liveCallAudioUrl?: string | null }) {
  return (
    <section className="relative overflow-hidden px-6 py-20 sm:py-28">
      <div
        className="landing-glow left-1/2 top-0 h-96 w-96 -translate-x-1/2 bg-[#4c5df0]/20"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:items-center lg:gap-10">
        <div>
          <span className="inline-flex items-center rounded-full border border-[var(--lp-border)] bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--lp-muted)]">
            AI Voice Agent
          </span>

          <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            You&apos;re one call away from a fully booked calendar.
          </h2>

          <p className="mt-5 text-[var(--lp-muted)]">
            Every new lead gets a call within seconds. Dialcom&apos;s Voice
            Agent asks the right qualifying questions, checks eligibility
            against your criteria, and hands hot leads straight to your team
            — no missed calls, no cold leads sitting overnight.
          </p>

          <ul className="mt-6 space-y-3">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-[var(--lp-text)]">{item}</span>
              </li>
            ))}
          </ul>

          <LiveCallButton audioUrl={liveCallAudioUrl} />
        </div>

        <LiveCallMockup />
      </div>
    </section>
  );
}

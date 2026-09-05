import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { TypewriterHeading } from "./TypewriterHeading";

/**
 * The site's original outbound-sales hero, kept as the very first section
 * ahead of the lending-focused Hero below it — see app/page.tsx. Only the
 * CTA was updated to reuse the current "Start Free 7-Day Trial" button
 * instead of the old gold "Request Access" one; everything else matches
 * the original design.
 */
export function IntroHero() {
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

      <LandingHeader />

      <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-10 text-center sm:pb-32 sm:pt-16">
        <span className="inline-flex items-center rounded-full border border-[var(--lp-border)] bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--lp-muted)]">
          AI voice agents for outbound sales
        </span>

        <TypewriterHeading />

        <p className="mx-auto mt-6 max-w-xl text-base text-[var(--lp-muted)] sm:text-lg">
          Dialcom&apos;s AI voice agents dial your list, qualify every lead, and
          book the appointment — straight onto your team&apos;s calendar.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lp-blue)] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--lp-blue-hover)] sm:w-auto"
          >
            Start Free 7-Day Trial →
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--lp-border)] px-7 py-3.5 text-sm font-semibold text-[var(--lp-text)] transition-colors hover:bg-white/5 sm:w-auto"
          >
            See how it works
          </a>
        </div>

        <p className="mt-5 text-sm text-[var(--lp-muted)]">
          Already booking calls?{" "}
          <Link href="/login" className="text-[var(--lp-accent)] hover:underline">
            Log in to your dashboard
          </Link>
        </p>
      </div>
    </section>
  );
}

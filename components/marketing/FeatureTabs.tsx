import { Film } from "lucide-react";

function DemoVideoPanel({ videoUrl }: { videoUrl?: string | null }) {
  if (videoUrl) {
    return (
      <video
        src={videoUrl}
        controls
        autoPlay
        muted
        loop
        playsInline
        className="block aspect-video w-full rounded-2xl bg-black"
      />
    );
  }

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--lp-border)] bg-black/20 text-center">
      <Film className="h-6 w-6 text-[var(--lp-muted)]" />
      <p className="text-sm font-medium text-[var(--lp-text)]">
        Demo video coming soon
      </p>
      <p className="max-w-xs text-xs text-[var(--lp-muted)]">
        A walkthrough of the platform will play here.
      </p>
    </div>
  );
}

export function FeatureTabs({ demoVideoUrl }: { demoVideoUrl?: string | null }) {
  return (
    <section id="how-it-works" className="relative px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold tracking-widest text-[var(--lp-accent)]">
            SEE IT IN ACTION
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Watch how Dialcom works.
          </h2>
          <p className="mt-4 text-[var(--lp-muted)]">
            From the first dial to a booked appointment — see how calls,
            calendars, customer records, campaigns, and rebuttals all flow
            through one platform, in one short walkthrough.
          </p>
        </div>

        <div className="mt-10">
          <DemoVideoPanel videoUrl={demoVideoUrl} />
        </div>
      </div>
    </section>
  );
}

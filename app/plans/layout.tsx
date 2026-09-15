import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Deliberately outside the (portal) route group — no sidebar, no nav. A
 * brand-new agent with no billing row at all lands here straight from
 * login (see the dashboard's redirect) and should see nothing *but* the
 * plan choice; the full portal chrome would just be a distraction (and
 * every nav link would 404-adjacent anyway, since there's no subscription
 * to place a call, book with, etc. yet). An agent choosing a *new* plan
 * later (trial expired, subscription canceled) also lands here via
 * Settings' "Choose a plan" link — same focused, checkout-like treatment
 * either way, they just aren't force-redirected into it.
 */
export default async function PlansLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 md:px-10">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
          <img src="/logo.svg" alt="Dialcom" className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <Avatar name={session.agent.name} />
            <div className="leading-tight">
              <p className="text-sm font-medium">{session.agent.name}</p>
              <p className="text-xs text-muted">{session.agent.email}</p>
            </div>
          </div>
          <SignOutButton className="border-l border-border pl-3" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-10 md:py-14">
        {children}
      </main>
    </div>
  );
}

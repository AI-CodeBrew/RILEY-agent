"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { isActivePath, visibleNavLinks } from "@/lib/nav";
import { UserMenu, type SessionAgentSummary } from "@/components/UserMenu";

export function Sidebar({ agent }: { agent: SessionAgentSummary }) {
  const pathname = usePathname();
  const links = visibleNavLinks(agent.role === "admin", agent.hasCalendarAccess);

  // The clicked link lights up immediately instead of waiting for the next
  // page to finish loading (usePathname only changes once it has) — cleared
  // as soon as the route actually commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen">
      <Link href="/dashboard" className="flex items-center px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
        <img src="/logo-light.svg" alt="Dialcom" className="h-6 w-auto" />
      </Link>

      <nav className="flex flex-col gap-0.5 px-3 pb-3">
        {links.map((link) => {
          const active = pendingHref ? pendingHref === link.href : isActivePath(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => {
                if (!isActivePath(pathname, link.href)) setPendingHref(link.href);
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand text-white shadow-md shadow-brand/30"
                  : "text-sidebar-foreground hover:bg-brand hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <UserMenu agent={agent} />
    </aside>
  );
}

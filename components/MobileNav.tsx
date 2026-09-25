"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActivePath, visibleNavLinks } from "@/lib/nav";
import { UserMenu, type SessionAgentSummary } from "@/components/UserMenu";

export function MobileNav({ agent }: { agent: SessionAgentSummary }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const links = visibleNavLinks(agent.role === "admin", agent.hasCalendarAccess);

  // Navigating from inside the drawer should close it.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
          <img src="/logo.svg" alt="Dialcom" className="h-5 w-auto" />
        </Link>
        <button
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg border border-border p-2 text-muted transition-colors hover:text-foreground"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-sidebar-border bg-sidebar text-sidebar-foreground">
          <nav className="flex flex-col gap-0.5 p-3">
            {links.map((link) => {
              const active = isActivePath(pathname, link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand text-white"
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
        </div>
      )}
    </header>
  );
}

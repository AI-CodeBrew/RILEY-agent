"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, PhoneCall, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActivePath, visibleNavLinks } from "@/lib/nav";
import { UserMenu, type SessionAgentSummary } from "@/components/UserMenu";

export function MobileNav({ agent }: { agent: SessionAgentSummary }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const links = visibleNavLinks(agent.role === "admin");

  // Navigating from inside the drawer should close it.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <PhoneCall className="h-3.5 w-3.5" />
          </div>
          Riley Booking
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
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-white/10 text-sidebar-foreground-active"
                      : "text-sidebar-foreground"
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

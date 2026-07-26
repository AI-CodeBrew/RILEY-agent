"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActivePath, visibleNavLinks } from "@/lib/nav";
import { UserMenu, type SessionAgentSummary } from "@/components/UserMenu";

export function Sidebar({ agent }: { agent: SessionAgentSummary }) {
  const pathname = usePathname();
  const links = visibleNavLinks(agent.role === "admin");

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PhoneCall className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sidebar-foreground-active">
          Riley Booking
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-3">
        {links.map((link) => {
          const active = isActivePath(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-sidebar-foreground-active"
                  : "text-sidebar-foreground hover:bg-white/5 hover:text-sidebar-foreground-active"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <UserMenu agent={agent} />
      </div>
    </aside>
  );
}

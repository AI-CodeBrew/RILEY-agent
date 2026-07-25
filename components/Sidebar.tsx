"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PhoneCall, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/agents", label: "Sales Agents", icon: UserRound },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PhoneCall className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sidebar-foreground-active">
          Riley Booking
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV_LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
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

      <div className="mt-auto px-5 py-4 text-xs text-sidebar-foreground/60">
        Single-tenant · no auth yet
      </div>
    </aside>
  );
}

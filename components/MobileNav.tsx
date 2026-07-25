"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PhoneCall, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/agents", label: "Agents", icon: UserRound },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PhoneCall className="h-3.5 w-3.5" />
        </div>
        Riley Booking
      </Link>
      <nav className="flex gap-1">
        {NAV_LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

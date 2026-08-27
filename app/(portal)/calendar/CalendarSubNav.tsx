"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, Puzzle } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  {
    href: "/calendar",
    label: "Meetings",
    icon: CalendarDays,
    active: (pathname: string) =>
      pathname === "/calendar" || pathname.startsWith("/calendar/grid"),
  },
  {
    href: "/calendar/availability",
    label: "Availability",
    icon: Clock,
    active: (pathname: string) => pathname.startsWith("/calendar/availability"),
  },
  {
    href: "/calendar/integrations",
    label: "Integrations & apps",
    icon: Puzzle,
    active: (pathname: string) => pathname.startsWith("/calendar/integrations"),
  },
];

export function CalendarSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-48 lg:flex-col lg:gap-0.5 lg:overflow-visible">
      {ITEMS.map((item) => {
        const active = item.active(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-background hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

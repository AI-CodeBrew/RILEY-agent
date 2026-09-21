"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  {
    href: "/forum",
    label: "Forum",
    icon: MessagesSquare,
    active: (pathname: string) =>
      pathname === "/forum" || (pathname.startsWith("/forum/") && !pathname.startsWith("/forum/chat")),
  },
  {
    href: "/forum/chat",
    label: "Chat",
    icon: MessageCircle,
    active: (pathname: string) => pathname.startsWith("/forum/chat"),
  },
];

/** Chat lives nested under Forum rather than as its own item in the main sidebar — this vertical icon stack is the switcher between the two. */
export function ForumSubNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 flex-row gap-2 lg:w-20 lg:flex-col">
      {ITEMS.map((item) => {
        const active = item.active(pathname);
        const Icon = item.icon;
        const badgeCount = item.href === "/forum/chat" ? unreadChatCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors lg:flex-none",
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-background hover:text-foreground"
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {badgeCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

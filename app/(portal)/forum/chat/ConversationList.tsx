"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { ChatAvatar } from "./ChatAvatar";

export type ConversationRow = {
  id: string;
  name: string;
  lastBody: string;
  /** Pre-formatted on the server ("2m", "1h", "Sep 3") so it can't drift from the server render during hydration. */
  timeLabel: string;
  unreadCount: number;
};

/**
 * Left pane of the chat screen. Searching filters the existing conversations
 * and also surfaces teammates you haven't messaged yet, so the search box
 * doubles as a quicker "new message" than the + button's picker.
 */
export function ConversationList({
  title,
  action,
  rows,
  teammates,
  activeId,
}: {
  title: string;
  action: React.ReactNode;
  rows: ConversationRow[];
  teammates: { id: string; name: string }[];
  activeId: string | null;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const visibleRows = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  const withConversation = new Set(rows.map((r) => r.id));
  const newMatches = q
    ? teammates.filter((t) => !withConversation.has(t.id) && t.name.toLowerCase().includes(q))
    : [];

  return (
    <div className="flex min-h-0 flex-col border-border md:border-r">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {action}
      </div>

      <div className="px-5 pb-3">
        <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm focus-within:border-violet-400 dark:border-violet-500/25 dark:bg-violet-500/10">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teammates"
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <div className="scroll-area min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {visibleRows.map((row) => {
          const active = row.id === activeId;
          return (
            <Link
              key={row.id}
              href={`/forum/chat?with=${row.id}`}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors",
                active
                  ? "bg-fuchsia-50 dark:bg-fuchsia-500/10"
                  : "hover:bg-surface-muted"
              )}
            >
              {active && (
                <span className="absolute inset-y-3 -left-3 w-1 rounded-r-full bg-fuchsia-600" />
              )}
              <ChatAvatar name={row.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold">{row.name}</p>
                  <span className="shrink-0 text-xs text-muted">{row.timeLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm",
                      row.unreadCount > 0 ? "font-medium text-foreground" : "text-muted"
                    )}
                  >
                    {row.lastBody}
                  </p>
                  {row.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-600 px-1.5 text-[11px] font-semibold text-white">
                      {row.unreadCount > 99 ? "99+" : row.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {newMatches.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">
              Start a chat
            </p>
            {newMatches.map((t) => (
              <Link
                key={t.id}
                href={`/forum/chat?with=${t.id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <ChatAvatar name={t.name} />
                <p className="truncate font-semibold">{t.name}</p>
              </Link>
            ))}
          </>
        )}

        {visibleRows.length === 0 && newMatches.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">
            {q ? "No teammates match that search." : "No conversations yet — tap + to message a teammate."}
          </p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { MessagesSquare, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { SearchInput } from "@/components/Filters";
import { NewTopicButton } from "./NewTopicButton";
import { ChatAvatar } from "./chat/ChatAvatar";
import { FORUM_CATEGORY_DOT, FORUM_CATEGORY_LABELS } from "@/lib/forum-category";
import type { ForumTopicWithAuthor } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSession();
  const { q } = await searchParams;

  let query = supabaseAdmin
    .from("forum_topics")
    .select("*, agent:sales_agents(id, name, email, role, timezone, created_at)")
    .order("created_at", { ascending: false });

  if (q) {
    const term = `%${q.replaceAll("%", "")}%`;
    query = query.or(`title.ilike.${term},body.ilike.${term}`);
  }

  const { data: topics } = await query;
  const topicIds = (topics ?? []).map((t) => t.id);

  const { data: replies } = topicIds.length
    ? await supabaseAdmin
        .from("forum_replies")
        .select("topic_id, created_at")
        .in("topic_id", topicIds)
    : { data: [] as { topic_id: string; created_at: string }[] };

  const activity = new Map<string, { count: number; lastAt: string }>();
  for (const reply of replies ?? []) {
    const existing = activity.get(reply.topic_id);
    if (!existing || reply.created_at > existing.lastAt) {
      activity.set(reply.topic_id, {
        count: (existing?.count ?? 0) + 1,
        lastAt: reply.created_at,
      });
    } else {
      activity.set(reply.topic_id, { ...existing, count: existing.count + 1 });
    }
  }

  const rows: ForumTopicWithAuthor[] = (topics ?? [])
    .map((topic) => {
      const stats = activity.get(topic.id);
      return {
        ...topic,
        reply_count: stats?.count ?? 0,
        last_activity_at: stats?.lastAt ?? topic.created_at,
      } as ForumTopicWithAuthor;
    })
    .sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <h1 className="text-3xl font-bold tracking-tight">Forum</h1>
          <p className="mt-1 text-sm text-muted">
            Discuss anything with the team — topics stay here for everyone to search and revisit.
          </p>
        </div>
        <NewTopicButton />
      </div>

      <SearchInput placeholder="Search topics…" variant="violet" />

      {rows.length > 0 ? (
        <ul className="space-y-3">
          {rows.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/forum/${topic.id}`}
                className="group flex items-start gap-4 rounded-2xl border border-violet-100 bg-surface p-4 transition-all hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/10 dark:border-violet-500/15 dark:hover:border-violet-500/40"
              >
                <ChatAvatar name={topic.agent?.name ?? "?"} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold transition-colors group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400">
                    {topic.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted">{topic.body}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FORUM_CATEGORY_DOT[topic.category])} />
                    {FORUM_CATEGORY_LABELS[topic.category]}
                    <span>·</span>
                    {topic.agent?.name ?? "Unknown"}
                    {topic.agent?.role === "admin" && (
                      <ShieldCheck className="h-3 w-3 text-fuchsia-600" aria-label="Admin" />
                    )}
                    <span>· {formatRelative(topic.created_at)}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <p
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 font-semibold",
                      topic.reply_count > 0
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                        : "bg-surface-muted text-muted"
                    )}
                  >
                    {topic.reply_count} {topic.reply_count === 1 ? "reply" : "replies"}
                  </p>
                  <p className="mt-1.5">{formatRelative(topic.last_activity_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={MessagesSquare}
            title={q ? "No matching topics" : "No topics yet"}
            description={
              q
                ? "Try a different search."
                : "Start the first discussion — everyone on the team can see and reply here."
            }
          />
        </Card>
      )}
    </div>
  );
}

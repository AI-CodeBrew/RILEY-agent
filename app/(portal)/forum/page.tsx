import Link from "next/link";
import { MessagesSquare, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { SearchInput } from "@/components/Filters";
import { NewTopicButton } from "./NewTopicButton";
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
      <PageHeader
        title="Forum"
        description="Discuss anything with the team — topics stay here for everyone to search and revisit."
        action={<NewTopicButton />}
      />

      <SearchInput placeholder="Search topics…" />

      <Card className="overflow-hidden">
        {rows.length > 0 ? (
          <ul className="divide-y divide-border">
            {rows.map((topic) => (
              <li key={topic.id}>
                <Link
                  href={`/forum/${topic.id}`}
                  className="group flex items-start gap-3 p-4 transition-colors hover:bg-background"
                >
                  <Avatar name={topic.agent?.name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-accent">
                      {topic.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{topic.body}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      {topic.agent?.name ?? "Unknown"}
                      {topic.agent?.role === "admin" && (
                        <ShieldCheck className="h-3 w-3 text-accent" aria-label="Admin" />
                      )}
                      <span>· {formatRelative(topic.created_at)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    <p
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 font-medium",
                        topic.reply_count > 0
                          ? "bg-accent-soft text-accent"
                          : "bg-background text-muted"
                      )}
                    >
                      {topic.reply_count} {topic.reply_count === 1 ? "reply" : "replies"}
                    </p>
                    <p className="mt-1">{formatRelative(topic.last_activity_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title={q ? "No matching topics" : "No topics yet"}
            description={
              q
                ? "Try a different search."
                : "Start the first discussion — everyone on the team can see and reply here."
            }
          />
        )}
      </Card>
    </div>
  );
}

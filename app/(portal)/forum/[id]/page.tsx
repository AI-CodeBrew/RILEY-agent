import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { AgentProfileTrigger } from "@/components/AgentProfileTrigger";
import { ForumDeleteButton } from "../ForumDeleteButton";
import { ReplyForm } from "./ReplyForm";
import { FORUM_CATEGORY_DOT, FORUM_CATEGORY_LABELS } from "@/lib/forum-category";
import type {
  AgentProfileSummary,
  ForumReplyWithAuthor,
  ForumTopic,
} from "@/types/database";

const AUTHOR_FIELDS = "id, name, email, role, timezone, created_at";

export const dynamic = "force-dynamic";

export default async function ForumTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [{ data: topic }, { data: replies }] = await Promise.all([
    supabaseAdmin
      .from("forum_topics")
      .select(`*, agent:sales_agents(${AUTHOR_FIELDS})`)
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("forum_replies")
      .select(`*, agent:sales_agents(${AUTHOR_FIELDS})`)
      .eq("topic_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!topic) notFound();

  const typedTopic = topic as ForumTopic & { agent: AgentProfileSummary | null };
  const typedReplies = (replies ?? []) as ForumReplyWithAuthor[];
  const canDeleteTopic = session.isAdmin || typedTopic.agent_id === session.agent.id;

  // One flat, divided list — the original post first (tagged "Author"),
  // then every reply in order — rather than a separate boxed card per post.
  const posts = [
    {
      id: typedTopic.id,
      agent: typedTopic.agent,
      agent_id: typedTopic.agent_id,
      body: typedTopic.body,
      created_at: typedTopic.created_at,
      isAuthor: true,
      canDelete: canDeleteTopic,
      deleteKind: "topic" as const,
    },
    ...typedReplies.map((reply) => ({
      id: reply.id,
      agent: reply.agent,
      agent_id: reply.agent_id,
      body: reply.body,
      created_at: reply.created_at,
      isAuthor: false,
      canDelete: session.isAdmin || reply.agent_id === session.agent.id,
      deleteKind: "reply" as const,
    })),
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Forum
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{typedTopic.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FORUM_CATEGORY_DOT[typedTopic.category])} />
          {FORUM_CATEGORY_LABELS[typedTopic.category]}
          <span>· {typedReplies.length} {typedReplies.length === 1 ? "reply" : "replies"}</span>
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {posts.map((post) => (
            <li key={post.id} className="flex items-start justify-between gap-3 p-5">
              <div className="flex min-w-0 items-start gap-3">
                {post.agent ? (
                  <AgentProfileTrigger
                    agent={post.agent}
                    className="shrink-0 rounded-full transition-transform hover:scale-105"
                  >
                    <Avatar name={post.agent.name} />
                  </AgentProfileTrigger>
                ) : (
                  <Avatar name="?" />
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {post.agent ? (
                      <AgentProfileTrigger
                        agent={post.agent}
                        className="hover:text-accent hover:underline"
                      >
                        {post.agent.name}
                      </AgentProfileTrigger>
                    ) : (
                      "Unknown"
                    )}
                    {post.isAuthor && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        Author
                      </span>
                    )}
                    <span className="text-xs font-normal text-muted">
                      {formatRelative(post.created_at)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
                </div>
              </div>
              {post.canDelete && (
                <ForumDeleteButton
                  kind={post.deleteKind}
                  id={post.id}
                  redirectTo={post.deleteKind === "topic" ? "/forum" : undefined}
                />
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-border p-5">
          <ReplyForm topicId={typedTopic.id} />
        </div>
      </Card>
    </div>
  );
}

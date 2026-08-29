import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { AgentProfileTrigger } from "@/components/AgentProfileTrigger";
import { ForumDeleteButton } from "../ForumDeleteButton";
import { ReplyForm } from "./ReplyForm";
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
  const canDeleteTopic = session.isAdmin || typedTopic.agent_id === session.agent.id;

  return (
    <div className="space-y-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Forum
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {typedTopic.agent ? (
              <AgentProfileTrigger
                agent={typedTopic.agent}
                className="shrink-0 rounded-full transition-transform hover:scale-105"
              >
                <Avatar name={typedTopic.agent.name} />
              </AgentProfileTrigger>
            ) : (
              <Avatar name="?" />
            )}
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{typedTopic.title}</h1>
              <p className="mt-0.5 text-xs text-muted">
                {typedTopic.agent ? (
                  <AgentProfileTrigger
                    agent={typedTopic.agent}
                    className="font-medium text-foreground/80 hover:text-foreground hover:underline"
                  >
                    {typedTopic.agent.name}
                  </AgentProfileTrigger>
                ) : (
                  "Unknown"
                )}{" "}
                · {formatDateTime(typedTopic.created_at, session.agent.timezone)}
              </p>
            </div>
          </div>
          {canDeleteTopic && (
            <ForumDeleteButton kind="topic" id={typedTopic.id} redirectTo="/forum" />
          )}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{typedTopic.body}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-accent" />
          {(replies?.length ?? 0)} {replies?.length === 1 ? "reply" : "replies"}
        </h2>

        {(replies ?? []).map((reply) => {
          const typedReply = reply as ForumReplyWithAuthor;
          const canDeleteReply = session.isAdmin || typedReply.agent_id === session.agent.id;
          return (
            <Card key={typedReply.id} className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {typedReply.agent ? (
                    <AgentProfileTrigger
                      agent={typedReply.agent}
                      className="shrink-0 rounded-full transition-transform hover:scale-105"
                    >
                      <Avatar name={typedReply.agent.name} />
                    </AgentProfileTrigger>
                  ) : (
                    <Avatar name="?" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {typedReply.agent ? (
                        <AgentProfileTrigger
                          agent={typedReply.agent}
                          className="hover:text-accent hover:underline"
                        >
                          {typedReply.agent.name}
                        </AgentProfileTrigger>
                      ) : (
                        "Unknown"
                      )}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {formatRelative(typedReply.created_at)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {typedReply.body}
                    </p>
                  </div>
                </div>
                {canDeleteReply && <ForumDeleteButton kind="reply" id={typedReply.id} />}
              </div>
            </Card>
          );
        })}
      </section>

      <Card className="p-4">
        <ReplyForm topicId={typedTopic.id} />
      </Card>
    </div>
  );
}

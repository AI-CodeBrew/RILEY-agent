import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAgentDirectory } from "@/lib/agent-directory";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { NewMessageButton } from "./NewMessageButton";
import { MessageComposer } from "./MessageComposer";
import type { DirectMessage } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const session = await requireSession();
  const meId = session.agent.id;
  const { with: withId } = await searchParams;

  const directory = await getAgentDirectory(meId);
  const directoryMap = new Map(directory.map((a) => [a.id, a]));
  const activeWith = withId && directoryMap.has(withId) ? withId : null;

  // Viewing a conversation marks its unread messages read — this is a
  // "refresh is fine" inbox, so there's no separate mark-as-read endpoint.
  if (activeWith) {
    await supabaseAdmin
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", meId)
      .eq("sender_id", activeWith)
      .is("read_at", null);
  }

  const [{ data: allMessages }, { data: thread }] = await Promise.all([
    supabaseAdmin
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
      .order("created_at", { ascending: false }),
    activeWith
      ? supabaseAdmin
          .from("direct_messages")
          .select("*")
          .or(
            `and(sender_id.eq.${meId},recipient_id.eq.${activeWith}),and(sender_id.eq.${activeWith},recipient_id.eq.${meId})`
          )
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as DirectMessage[] }),
  ]);

  type ConversationSummary = {
    otherId: string;
    lastBody: string;
    lastAt: string;
    unreadCount: number;
  };

  const conversations = new Map<string, ConversationSummary>();
  for (const message of (allMessages ?? []) as DirectMessage[]) {
    const otherId = message.sender_id === meId ? message.recipient_id : message.sender_id;
    if (!directoryMap.has(otherId)) continue;

    const isUnread = message.recipient_id === meId && !message.read_at;
    const existing = conversations.get(otherId);
    if (!existing) {
      conversations.set(otherId, {
        otherId,
        lastBody: message.body,
        lastAt: message.created_at,
        unreadCount: isUnread ? 1 : 0,
      });
    } else if (isUnread) {
      existing.unreadCount += 1;
    }
  }

  const conversationRows = [...conversations.values()].sort((a, b) =>
    a.lastAt < b.lastAt ? 1 : -1
  );

  const activeAgent = activeWith ? directoryMap.get(activeWith) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chats"
        description="Direct messages between you and your teammates."
        action={<NewMessageButton directory={directory} />}
      />

      <Card className="grid grid-cols-1 overflow-hidden md:h-[32rem] md:grid-cols-[16rem_1fr]">
        <div className="scroll-area overflow-y-auto border-border md:border-r">
          {conversationRows.length > 0 ? (
            <ul className="divide-y divide-border">
              {conversationRows.map((conv) => {
                const agent = directoryMap.get(conv.otherId);
                if (!agent) return null;
                const active = conv.otherId === activeWith;
                return (
                  <li key={conv.otherId}>
                    <Link
                      href={`/inbox?with=${conv.otherId}`}
                      className={cn(
                        "flex items-start gap-2.5 p-3 transition-colors hover:bg-background",
                        active && "bg-background"
                      )}
                    >
                      <Avatar name={agent.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{agent.name}</p>
                          {conv.unreadCount > 0 && (
                            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted">{conv.lastBody}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={Mail}
                title="No conversations yet"
                description="Use New message to reach a teammate."
              />
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          {activeAgent ? (
            <>
              <div className="scroll-area min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {((thread ?? []) as DirectMessage[]).map((message) => {
                  const mine = message.sender_id === meId;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                          mine
                            ? "bg-accent text-accent-foreground"
                            : "bg-background text-foreground"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            mine ? "text-accent-foreground/70" : "text-muted"
                          )}
                        >
                          {formatDateTime(message.created_at, session.agent.timezone)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <MessageComposer recipientId={activeAgent.id} />
            </>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Pick a conversation"
              description="Select someone on the left, or start a new message."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

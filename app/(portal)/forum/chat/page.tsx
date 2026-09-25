import { MessageCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAgentDirectory } from "@/lib/agent-directory";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/Card";
import { NewMessageButton } from "./NewMessageButton";
import { MessageComposer } from "./MessageComposer";
import { ConversationList, type ConversationRow } from "./ConversationList";
import { ChatAvatar } from "./ChatAvatar";
import type { DirectMessage } from "@/types/database";

export const dynamic = "force-dynamic";

/** YYYY-MM-DD in the agent's time zone — what "same day" means for the date separators. */
function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** "Today" / "Yesterday" / "Mon, Sep 22" for the pill between days in a thread. */
function dayLabel(iso: string, now: Date, timeZone: string) {
  const key = dayKey(new Date(iso), timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** Compact age for the conversation list: "now", "2m", "1h", "3d", then a plain date. */
function shortAge(iso: string, now: Date, timeZone: string) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
    new Date(iso)
  );
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const session = await requireSession();
  const meId = session.agent.id;
  const timeZone = session.agent.timezone;
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

  const now = new Date();

  const conversations = new Map<string, ConversationRow & { lastAt: string }>();
  for (const message of (allMessages ?? []) as DirectMessage[]) {
    const otherId = message.sender_id === meId ? message.recipient_id : message.sender_id;
    const agent = directoryMap.get(otherId);
    if (!agent) continue;

    const isUnread = message.recipient_id === meId && !message.read_at;
    const existing = conversations.get(otherId);
    if (!existing) {
      conversations.set(otherId, {
        id: otherId,
        name: agent.name,
        lastBody: message.body,
        lastAt: message.created_at,
        timeLabel: shortAge(message.created_at, now, timeZone),
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
  const messages = (thread ?? []) as DirectMessage[];

  return (
    <Card className="grid grid-cols-1 overflow-hidden md:h-[calc(100dvh-8rem)] md:min-h-[32rem] md:grid-cols-[20rem_1fr]">
      <ConversationList
        title="Chat"
        action={<NewMessageButton directory={directory} />}
        rows={conversationRows}
        teammates={directory.map((a) => ({ id: a.id, name: a.name }))}
        activeId={activeWith}
      />

      <div className="flex min-h-[28rem] flex-col md:min-h-0">
        {activeAgent ? (
          <>
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <ChatAvatar name={activeAgent.name} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold leading-tight">{activeAgent.name}</p>
                <p className="truncate text-xs text-muted">{activeAgent.email}</p>
              </div>
            </div>

            {/* column-reverse keeps the scroll pinned to the newest message on load */}
            <div className="scroll-area flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-5 py-4">
              <div>
                {messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted">
                    Say hi to {activeAgent.name} — this is the start of your conversation.
                  </p>
                )}
                {messages.map((message, i) => {
                  const mine = message.sender_id === meId;
                  const prev = messages[i - 1];
                  const newDay =
                    !prev ||
                    dayKey(new Date(prev.created_at), timeZone) !==
                      dayKey(new Date(message.created_at), timeZone);
                  // Consecutive messages from the same sender are grouped —
                  // only the first in a run shows the avatar.
                  const isFirstInGroup = newDay || prev.sender_id !== message.sender_id;

                  return (
                    <div key={message.id}>
                      {newDay && (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-900/70 dark:bg-violet-500/15 dark:text-violet-200">
                            {dayLabel(message.created_at, now, timeZone)}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-start gap-3",
                          mine ? "justify-end" : "justify-start",
                          isFirstInGroup ? "mt-4" : "mt-1.5"
                        )}
                      >
                        {!mine && (
                          <div className="w-8 shrink-0">
                            {isFirstInGroup && <ChatAvatar name={activeAgent.name} size="sm" />}
                          </div>
                        )}
                        <div className={cn("flex max-w-[75%] flex-col gap-1", mine && "items-end")}>
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                              mine
                                ? "rounded-br-md bg-linear-to-br from-violet-600 to-fuchsia-600 text-white"
                                : "rounded-tl-md bg-violet-100/70 text-foreground dark:bg-violet-500/15"
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          </div>
                          <span className="px-1 text-[11px] text-muted">
                            {formatTime(message.created_at, timeZone)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <MessageComposer recipientId={activeAgent.id} recipientName={activeAgent.name} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-fuchsia-200 bg-fuchsia-100 text-fuchsia-600 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
              <MessageCircle className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-lg font-bold">Pick a conversation</h2>
            <p className="mt-1.5 max-w-xs text-sm text-muted">
              Select someone on the left, or start a new message to reach any teammate directly.
            </p>
            <div className="mt-6">
              <NewMessageButton directory={directory} variant="cta" />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

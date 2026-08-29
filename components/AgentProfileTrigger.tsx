"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AgentProfileSummary } from "@/types/database";

/**
 * Wraps any trigger content (an avatar, a name, both) so clicking it opens a
 * profile card instead of navigating away — used wherever a forum post or
 * reply shows its author. The card's own "Message" button is what actually
 * takes you to the chat (/inbox?with=), so the trigger itself never has to
 * choose between "show profile" and "start chatting."
 */
export function AgentProfileTrigger({
  agent,
  className,
  children,
}: {
  agent: AgentProfileSummary;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn("text-left", className)}
      >
        {children}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Profile" className="max-w-sm">
        <div className="-mt-1 flex flex-col items-center gap-3 pb-1 text-center">
          <Avatar name={agent.name} size="lg" />
          <div>
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold tracking-tight">{agent.name}</p>
              {agent.role === "admin" && (
                <ShieldCheck className="h-4 w-4 text-accent" aria-label="Admin" />
              )}
            </div>
            <p className="text-sm text-muted">{agent.email}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Role</dt>
            <dd className="mt-0.5 font-medium capitalize">{agent.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Timezone</dt>
            <dd className="mt-0.5 truncate font-medium">{agent.timezone}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted">Joined</dt>
            <dd className="mt-0.5 font-medium">{formatDate(agent.created_at, agent.timezone)}</dd>
          </div>
        </dl>

        <Button
          className="w-full"
          onClick={() => {
            setOpen(false);
            router.push(`/inbox?with=${agent.id}`);
          }}
        >
          <MessageCircle className="h-4 w-4" />
          Message {agent.name.split(" ")[0]}
        </Button>
      </Modal>
    </>
  );
}

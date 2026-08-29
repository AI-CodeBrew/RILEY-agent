"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

export function MessageComposer({ recipientId }: { recipientId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: recipientId, body }),
    });
    const data = await res.json().catch(() => ({}));

    setSending(false);

    if (!res.ok) {
      toast(data.error ?? "Could not send that message.", "error");
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
        className="min-h-10 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
      <Button type="submit" size="md" loading={sending} disabled={!body.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { useToast } from "@/components/Toast";

export function MessageComposer({
  recipientId,
  recipientName,
}: {
  recipientId: string;
  recipientName: string;
}) {
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
    <form onSubmit={handleSubmit} className="flex items-end gap-3 border-t border-border px-5 py-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Message ${recipientName}…`}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
        className="max-h-40 min-h-12 flex-1 resize-none rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm outline-none transition-shadow [field-sizing:content] placeholder:text-muted focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-violet-500/25 dark:bg-violet-500/10 dark:focus:ring-violet-500/20"
      />
      <button
        type="submit"
        disabled={!body.trim() || sending}
        aria-label="Send message"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-500/25 transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
      </button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

export function ReplyForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPosting(true);

    const res = await fetch(`/api/forum/topics/${topicId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));

    setPosting(false);

    if (!res.ok) {
      toast(data.error ?? "Could not post that reply.", "error");
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="reply-body" className="sr-only">
        Reply
      </label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply"
        rows={3}
        className="min-h-20 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
      <div className="flex justify-end">
        <Button type="submit" loading={posting} disabled={!body.trim()}>
          Post reply
        </Button>
      </div>
    </form>
  );
}

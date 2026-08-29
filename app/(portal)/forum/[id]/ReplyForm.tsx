"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { TextareaField } from "@/components/Field";
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
    <form onSubmit={handleSubmit} className="space-y-2">
      <TextareaField
        label="Reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add to the discussion…"
        rows={3}
      />
      <Button type="submit" size="sm" loading={posting} disabled={!body.trim()}>
        Post reply
      </Button>
    </form>
  );
}

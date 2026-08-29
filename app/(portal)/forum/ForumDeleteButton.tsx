"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";

/** Small icon-only delete control shared by topics and replies — visible only to the author or an admin, enforced again server-side by the DELETE route. */
export function ForumDeleteButton({
  kind,
  id,
  redirectTo,
}: {
  kind: "topic" | "reply";
  id: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete this ${kind}? This can't be undone.`)) return;
    setWorking(true);

    const path = kind === "topic" ? `/api/forum/topics/${id}` : `/api/forum/replies/${id}`;
    const res = await fetch(path, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));

    setWorking(false);

    if (!res.ok) {
      toast(body.error ?? `Could not delete this ${kind}.`, "error");
      return;
    }

    toast(kind === "topic" ? "Topic deleted." : "Reply deleted.", "success");
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={working}
      aria-label={`Delete ${kind}`}
      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

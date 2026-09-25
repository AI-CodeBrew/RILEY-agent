"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SelectField } from "@/components/Field";
import type { DirectoryAgent } from "@/lib/agent-directory";

/** `icon` is the compact + in the conversation list header; `cta` is the full-width-text button in the empty thread pane. Both open the same picker. */
export function NewMessageButton({
  directory,
  variant = "icon",
}: {
  directory: DirectoryAgent[];
  variant?: "icon" | "cta";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");

  function handleStart() {
    if (!agentId) return;
    setOpen(false);
    router.push(`/forum/chat?with=${agentId}`);
  }

  return (
    <>
      {variant === "cta" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/30 transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Start new message
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="New message"
          title="New message"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-500/25 transition-opacity hover:opacity-90"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Message a teammate"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={!agentId}>
              Start conversation
            </Button>
          </>
        }
      >
        <SelectField
          label="Teammate"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Select someone…</option>
          {directory.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
      </Modal>
    </>
  );
}

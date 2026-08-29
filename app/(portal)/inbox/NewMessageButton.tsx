"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SelectField } from "@/components/Field";
import type { DirectoryAgent } from "@/lib/agent-directory";

export function NewMessageButton({ directory }: { directory: DirectoryAgent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");

  function handleStart() {
    if (!agentId) return;
    setOpen(false);
    router.push(`/inbox?with=${agentId}`);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        New message
      </Button>

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

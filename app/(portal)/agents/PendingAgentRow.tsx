"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export interface PendingAgent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

/**
 * One row of the approval queue. Approving flips the registration to
 * `approved`, which is the only thing standing between the agent and a
 * working login — from there they connect their own Calendly and buy their
 * own outbound number from Settings.
 */
export function PendingAgentRow({
  agent,
  requestedLabel,
}: {
  agent: PendingAgent;
  requestedLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function decide(
    approval_status: "approved" | "rejected",
    rejection_reason?: string
  ) {
    setWorking(approval_status === "approved" ? "approve" : "reject");

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_status, rejection_reason }),
    });

    setWorking(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Failed to save that decision", "error");
      return;
    }

    setRejecting(false);
    toast(
      approval_status === "approved"
        ? `${agent.name} can now sign in.`
        : `${agent.name}'s registration was declined.`,
      "success"
    );
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={agent.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{agent.name}</p>
          <p className="truncate text-xs text-muted">
            {agent.email}
            {agent.phone ? ` · ${agent.phone}` : ""} · requested {requestedLabel}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          loading={working === "approve"}
          onClick={() => decide("approved")}
        >
          {working !== "approve" && <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={working !== null}
          onClick={() => setRejecting(true)}
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </Button>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject ${agent.name}?`}
        description="They'll see this reason if they try to sign in. The account stays on file, so you can still approve it later."
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            decide("rejected", reason);
          }}
        >
          <Field
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional — e.g. not a member of this team"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRejecting(false)}
              disabled={working === "reject"}
            >
              Cancel
            </Button>
            <Button type="submit" loading={working === "reject"}>
              Reject registration
            </Button>
          </div>
        </form>
      </Modal>
    </li>
  );
}

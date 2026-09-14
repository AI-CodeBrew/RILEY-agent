"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/Button";
import { TextareaField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import type { CallType } from "@/types/database";

export interface UnreviewedRebuttal {
  id: string;
  script: CallType;
  objection_text: string;
  answer_text: string;
  created_at: string;
}

const SCRIPT_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

/**
 * One card in the agent's unreviewed queue. Approving makes this the answer
 * lookup-rebuttal returns to every agent's future calls on this script, not
 * just this agent's own — see the migration's header comment.
 */
export function UnreviewedRebuttalRow({ rebuttal }: { rebuttal: UnreviewedRebuttal }) {
  const router = useRouter();
  const toast = useToast();
  const [answerText, setAnswerText] = useState(rebuttal.answer_text);
  const [working, setWorking] = useState<"approve" | "reject" | null>(null);

  async function decide(status: "approved" | "rejected") {
    setWorking(status === "approved" ? "approve" : "reject");

    const res = await fetch(`/api/rebuttals/${rebuttal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        status === "approved" ? { answer_text: answerText, status } : { status }
      ),
    });

    setWorking(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Failed to save that decision", "error");
      return;
    }

    toast(
      status === "approved"
        ? "Approved — this answer is now live for every agent's calls on this script."
        : "Rejected.",
      "success"
    );
    router.refresh();
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-background px-2 py-0.5 font-medium">
          {SCRIPT_LABELS[rebuttal.script]}
        </span>
        <span>Customer objection</span>
      </div>
      <p className="text-sm">{rebuttal.objection_text}</p>

      <TextareaField
        label="AI-generated answer"
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        disabled={working !== null}
        hint="Edit this before approving if it needs a tweak — this is exactly what gets reused next time."
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={working !== null}
          onClick={() => decide("rejected")}
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </Button>
        <Button size="sm" loading={working === "approve"} onClick={() => decide("approved")}>
          {working !== "approve" && <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
      </div>
    </li>
  );
}

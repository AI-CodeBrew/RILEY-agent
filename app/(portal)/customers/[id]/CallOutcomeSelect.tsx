"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "@/lib/status-badge";
import { CALL_OUTCOMES, type CallOutcome } from "@/types/database";

const OUTCOME_LABELS: Record<Exclude<CallOutcome, null>, string> = {
  appointment_set: "Appointment set",
  no_answer: "No answer",
  voicemail: "Voicemail",
  not_interested: "Not interested",
  call_back_later: "Call back later",
  error: "Error",
  sold: "Sold",
};

/**
 * Lets an agent correct a call's outcome directly from the call history list
 * — e.g. the AI logged `not_interested` but the customer actually bought.
 * Only rendered once a call has a real outcome; live/unclassified calls keep
 * showing the plain status badge (see CallHistoryList).
 */
export function CallOutcomeSelect({
  callId,
  outcome,
}: {
  callId: string;
  outcome: Exclude<CallOutcome, null>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(outcome);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: Exclude<CallOutcome, null>) {
    const previous = value;
    setValue(next);
    setSaving(true);

    const res = await fetch(`/api/calls/${callId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: next }),
    });

    setSaving(false);

    if (!res.ok) {
      setValue(previous);
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not update call outcome.", "error");
      return;
    }

    toast("Call outcome updated.", "success");
    router.refresh();
  }

  const style = STATUS_STYLES[value] ?? "bg-zinc-500/10 text-zinc-600";

  return (
    <select
      value={value}
      disabled={saving}
      // Stops the click from bubbling to the <summary> this sits inside,
      // which would otherwise toggle the call row open/closed.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value as Exclude<CallOutcome, null>)}
      aria-label="Call outcome"
      className={cn(
        "cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none transition-shadow focus:ring-2 focus:ring-accent-soft disabled:cursor-wait disabled:opacity-60",
        style
      )}
    >
      {CALL_OUTCOMES.map((o) => (
        <option key={o} value={o} className="bg-surface text-foreground">
          {OUTCOME_LABELS[o]}
        </option>
      ))}
    </select>
  );
}

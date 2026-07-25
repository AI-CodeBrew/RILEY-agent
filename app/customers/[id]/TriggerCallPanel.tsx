"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/Button";

interface Agent {
  id: string;
  name: string;
  calendly_user_uri: string | null;
}

export function TriggerCallPanel({
  customerId,
  agents,
}: {
  customerId: string;
  agents: Agent[];
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleCall() {
    if (!agentId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, agent_id: agentId }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start call");
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sales agents yet — add one on the{" "}
        <a href="/agents" className="text-accent hover:underline">
          agents page
        </a>{" "}
        before triggering a call.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div>
        <label className="block text-xs font-medium text-muted">
          Assign sales agent
        </label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="mt-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
              {!agent.calendly_user_uri ? " (Calendly not connected)" : ""}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={handleCall} disabled={submitting}>
        <PhoneOutgoing className="h-4 w-4" />
        {submitting ? "Starting call…" : "Trigger outbound call"}
      </Button>
      {success && <p className="text-sm text-emerald-600">Call started.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

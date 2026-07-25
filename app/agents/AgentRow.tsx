"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleDashed, Phone } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";

interface Agent {
  id: string;
  name: string;
  email: string;
  calendly_url: string | null;
  calendly_user_uri: string | null;
  vapi_phone_number_id: string | null;
  vapi_phone_number: string | null;
}

function PhoneNumberCell({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (agent.vapi_phone_number_id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Phone className="h-3.5 w-3.5" />
        {agent.vapi_phone_number}
      </span>
    );
  }

  async function handleRequest() {
    setRequesting(true);
    setError(null);

    const res = await fetch(`/api/agents/${agent.id}/phone-number`, {
      method: "POST",
    });

    setRequesting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to request number");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button variant="secondary" size="sm" onClick={handleRequest} disabled={requesting}>
        <Phone className="h-3.5 w-3.5" />
        {requesting
          ? "Requesting…"
          : agent.vapi_phone_number
            ? "Retry connecting number"
            : "Get phone number"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function AgentRow({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [email, setEmail] = useState(agent.email);
  const [calendlyUrl, setCalendlyUrl] = useState(agent.calendly_url ?? "");
  const [calendlyToken, setCalendlyToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        calendly_url: calendlyUrl,
        ...(calendlyToken ? { calendly_access_token: calendlyToken } : {}),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save");
      return;
    }

    setCalendlyToken("");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <tr className="border-b border-border last:border-0 hover:bg-background">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={agent.name} />
            <span className="font-medium">{agent.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-muted">{agent.email}</td>
        <td className="px-4 py-3">
          {agent.calendly_user_uri ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
              <CircleDashed className="h-3.5 w-3.5" />
              Not connected
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <PhoneNumberCell agent={agent} />
        </td>
        <td className="px-4 py-3 text-right">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-3 space-y-1.5">
        <input
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
          placeholder="Calendly URL"
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={calendlyToken}
          onChange={(e) => setCalendlyToken(e.target.value)}
          type="password"
          placeholder="New Calendly token (optional)"
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <PhoneNumberCell agent={agent} />
      </td>
      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
        <Button size="sm" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </td>
    </tr>
  );
}

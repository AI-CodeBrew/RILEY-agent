"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";

/**
 * Connecting Calendly is what lets the voice agent read this agent's real
 * availability and book on their calendar, so the state here is worth being
 * explicit about — including the webhook subscription, which is what flips
 * an appointment from "scheduled" to "confirmed" once the customer clicks
 * through.
 */
export function CalendlyConnection({
  agent,
}: {
  agent: {
    id: string;
    calendlyUrl: string | null;
    connected: boolean;
    webhooksActive: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendlyUrl, setCalendlyUrl] = useState(agent.calendlyUrl ?? "");
  const [token, setToken] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendly_url: calendlyUrl,
        ...(token ? { calendly_access_token: token } : {}),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not connect Calendly.");
      return;
    }

    setToken("");
    toast(token ? "Calendly connected." : "Calendly URL saved.", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {agent.connected ? (
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

        {agent.connected && !agent.webhooksActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Auto-confirm off
          </span>
        )}
      </div>

      {agent.connected && !agent.webhooksActive && (
        <p className="text-xs text-muted">
          Calendly didn&apos;t accept a webhook subscription for this account
          (webhooks need a Standard plan or above). Bookings still work —
          appointments just stay at &ldquo;awaiting confirmation&rdquo; instead of
          flipping to confirmed by themselves.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Calendly scheduling URL"
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
          placeholder="https://calendly.com/you"
        />
        <Field
          label={agent.connected ? "Replace access token" : "Personal access token"}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={agent.connected ? "Leave blank to keep the current one" : "eyJraWQ…"}
          hint="Calendly → Integrations → API & Webhooks → Generate New Token."
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={saving}>
          {agent.connected ? "Update Calendly" : "Connect Calendly"}
        </Button>
      </form>
    </div>
  );
}

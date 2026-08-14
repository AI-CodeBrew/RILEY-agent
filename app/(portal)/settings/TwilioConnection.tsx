"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";

function maskSid(sid: string) {
  if (sid.length <= 8) return sid;
  return `${sid.slice(0, 6)}••••${sid.slice(-4)}`;
}

/**
 * Lets an agent connect their own Twilio account (separate from the shared
 * business account used for number provisioning). Twilio has no OAuth login
 * for handing over an existing account, so this validates a pasted Account
 * SID + Auth Token against Twilio directly, the same way CalendlyConnection
 * validates a pasted personal access token.
 */
export function TwilioConnection({
  agent,
}: {
  agent: {
    id: string;
    connected: boolean;
    accountName: string | null;
    accountSid: string | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setError(null);

    const res = await fetch(`/api/agents/${agent.id}/twilio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_sid: accountSid, auth_token: authToken }),
    });
    const body = await res.json().catch(() => ({}));

    setConnecting(false);

    if (!res.ok) {
      setError(body.error ?? "Could not connect Twilio.");
      return;
    }

    setAccountSid("");
    setAuthToken("");
    toast("Twilio connected.", "success");
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await fetch(`/api/agents/${agent.id}/twilio`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDisconnecting(false);

    if (!res.ok) {
      toast(body.error ?? "Could not disconnect Twilio.", "error");
      return;
    }

    toast("Twilio disconnected.", "success");
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
      </div>

      {agent.connected ? (
        <div className="space-y-3">
          <p className="text-sm">
            {agent.accountName ?? "Twilio account"}
            {agent.accountSid && (
              <span className="ml-1.5 text-xs text-muted">{maskSid(agent.accountSid)}</span>
            )}
          </p>
          <Button variant="secondary" onClick={handleDisconnect} loading={disconnecting}>
            Disconnect Twilio
          </Button>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-3">
          <Field
            label="Account SID"
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            placeholder="AC…"
          />
          <Field
            label="Auth Token"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Your Twilio Auth Token"
            hint="Twilio Console → Account → API keys & tokens."
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" loading={connecting}>
            Connect Twilio
          </Button>
        </form>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

/**
 * Lets an agent connect their own Zoom account so locally-booked
 * appointments (Calendar → Availability hours, no Calendly) get a real
 * Zoom join link. Real OAuth redirect — unlike Calendly/Twilio's
 * paste-a-token forms, "Connect" is a top-level navigation to
 * /api/oauth/zoom/start, not a fetch.
 */
export function ZoomConnection({
  agent,
}: {
  agent: {
    id: string;
    connected: boolean;
    accountEmail: string | null;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [disconnecting, setDisconnecting] = useState(false);
  const handledResult = useRef(false);

  useEffect(() => {
    const result = searchParams.get("zoom");
    if (!result || handledResult.current) return;
    handledResult.current = true;

    if (result === "connected") {
      toast("Zoom account connected.", "success");
    } else if (result === "error") {
      // TEMP: zoom_detail surfaces the real failure reason while wiring up
      // the integration — remove alongside the matching code in the
      // /api/oauth/zoom/callback route once the flow is confirmed working.
      const detail = searchParams.get("zoom_detail");
      toast(
        detail
          ? `Could not connect your Zoom account: ${detail}`
          : "Could not connect your Zoom account. Please try again.",
        "error"
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("zoom");
    url.searchParams.delete("zoom_detail");
    router.replace(`${url.pathname}${url.search}`);
    // Only run once, when the redirect param first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await fetch(`/api/agents/${agent.id}/zoom`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDisconnecting(false);

    if (!res.ok) {
      toast(body.error ?? "Could not disconnect Zoom.", "error");
      return;
    }

    toast("Zoom disconnected.", "success");
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
          <p className="text-sm">{agent.accountEmail ?? "Zoom account"}</p>
          <Button variant="secondary" onClick={handleDisconnect} loading={disconnecting}>
            Disconnect Zoom
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Used only for locally-booked meetings (agents with weekly hours
            set on Calendar → Availability, instead of Calendly) — gives
            those appointments a real Zoom join link.
          </p>
          {/* Plain <a>, not next/link — this must be a real full-page
              navigation so the browser (not the client router) follows the
              redirect to Zoom's consent screen. */}
          <a
            href="/api/oauth/zoom/start"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            Connect with Zoom
          </a>
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, PhoneOutgoing, Radio } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { CancelCallButton } from "@/components/CancelCallButton";
import { useToast } from "@/components/Toast";
import { CallStatusBadge } from "@/lib/status-badge";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { DialTimelineEvent } from "@/lib/ring-timeout";
import type { Call, CallStatus } from "@/types/database";

interface Agent {
  id: string;
  name: string;
  calendly_user_uri: string | null;
}

const LIVE_LABEL: Record<string, string> = {
  scheduled: "Scheduled — Riley will dial at the time you picked.",
  queued: "Queued with Vapi — dialling any second now.",
  ringing: "Ringing…",
  in_progress: "Riley is on the call.",
};

type DialSnapshot = {
  vapiStatus: string | null;
  twilioStatus: string | null;
  callSid: string | null;
  dialElapsedSec: number;
  ringElapsedSec: number | null;
  phase: string;
  timeline: DialTimelineEvent[];
};

function formatTimelineLine(event: DialTimelineEvent): string {
  const ring = event.ringSec != null ? ` ring+${event.ringSec.toFixed(1)}s` : "";
  return `[dial+${event.dialSec.toFixed(1)}s] Vapi=${event.vapi} Twilio=${event.twilio}${ring} — ${event.message}`;
}

export function TriggerCallPanel({
  customerId,
  customerName,
  dialFrom,
  customerStatus,
  agent,
  hasAnyNumbers,
  liveCall,
  timezone,
}: {
  customerId: string;
  customerName: string;
  /** "Will call from +1 (403) 555-0100 (Alberta)" — computed server-side from the customer's phone, which agents never receive directly (see lib/customer-visibility.ts). Null if no number is routed for this customer's area code. */
  dialFrom: string | null;
  customerStatus: string;
  /** Always the signed-in agent — a call goes out on one of their numbers. */
  agent: Agent | null;
  /** Whether this agent has connected any outbound number at all. */
  hasAnyNumbers: boolean;
  /** The call already in flight for this customer, if any. */
  liveCall: Call | null;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [scheduleFor, setScheduleFor] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<CallStatus | null>(liveCall?.status ?? null);
  const [lastServerStatus, setLastServerStatus] = useState(liveCall?.status ?? null);
  const [dial, setDial] = useState<DialSnapshot | null>(null);

  // A server refresh is authoritative — adopt its status over whatever the
  // poll below last saw (React's documented adjust-during-render pattern).
  if ((liveCall?.status ?? null) !== lastServerStatus) {
    setLastServerStatus(liveCall?.status ?? null);
    setStatus(liveCall?.status ?? null);
  }

  // While a call is live, poll often so queued → ringing → cut shows like
  // the dial trace (Twilio status + dial/ring clocks).
  useEffect(() => {
    if (!liveCall) {
      setDial(null);
      return;
    }
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/calls/${liveCall!.id}`);
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { call: Call; dial?: DialSnapshot | null };
      setStatus(body.call.status);
      if (body.dial) setDial(body.dial);
      if (
        body.call.status === "ended" ||
        body.call.status === "canceled" ||
        body.call.status === "failed"
      ) {
        router.refresh();
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [liveCall, router]);

  async function handleCall() {
    setSubmitting(true);

    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        scheduled_for: showSchedule && scheduleFor
          ? new Date(scheduleFor).toISOString()
          : undefined,
      }),
    });

    const body = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast(body.error ?? "Failed to start call", "error");
      return;
    }

    toast(
      showSchedule && scheduleFor
        ? `Call scheduled for ${formatDateTime(new Date(scheduleFor).toISOString(), timezone)}.`
        : `Calling ${customerName}…`,
      "success"
    );
    setShowSchedule(false);
    setScheduleFor("");
    router.refresh();
  }

  if (!agent) {
    return (
      <p className="text-sm text-muted">
        No sales agent is set up to call from yet — connect a Calendly account
        and phone number on the{" "}
        <a href="/settings" className="text-accent hover:underline">
          settings page
        </a>{" "}
        first.
      </p>
    );
  }

  // A call already in flight replaces the whole form — the API refuses a
  // second concurrent call anyway.
  if (liveCall && status && status !== "ended" && status !== "canceled" && status !== "failed") {
    const timeline = dial?.timeline ?? [];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-2.5">
            <Radio className="h-4 w-4 animate-pulse text-red-600 dark:text-red-400" />
            <div>
              <div className="flex items-center gap-2">
                <CallStatusBadge status={status} />
                <span className="text-sm font-medium">{LIVE_LABEL[status] ?? status}</span>
              </div>
              <p className="text-xs text-muted">
                {liveCall.scheduled_for
                  ? `Dials ${formatRelative(liveCall.scheduled_for)} · ${formatDateTime(liveCall.scheduled_for, timezone)}`
                  : `Started ${formatRelative(liveCall.created_at)}`}
                {dial ? (
                  <>
                    {" · "}
                    dial+{dial.dialElapsedSec.toFixed(1)}s
                    {dial.ringElapsedSec != null
                      ? ` · ring+${dial.ringElapsedSec.toFixed(1)}s`
                      : ""}
                    {dial.twilioStatus ? ` · Twilio ${dial.twilioStatus}` : ""}
                    {dial.vapiStatus ? ` · Vapi ${dial.vapiStatus}` : ""}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <CancelCallButton
            callId={liveCall.id}
            customerName={customerName}
            status={status}
          />
        </div>

        {timeline.length > 0 ? (
          <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-muted">
            {timeline.map((event, i) => (
              <div key={`${event.at}-${i}`}>{formatTimelineLine(event)}</div>
            ))}
          </pre>
        ) : (
          <p className="text-xs text-muted">
            Dial timeline will appear here (queued → ringing → cut)…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {customerStatus === "do_not_call" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          This customer asked not to be called. Calling is blocked.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {showSchedule && (
          <Field
            label="Dial at"
            type="datetime-local"
            value={scheduleFor}
            onChange={(e) => setScheduleFor(e.target.value)}
            className="sm:w-56"
          />
        )}

        <Button
          onClick={handleCall}
          loading={submitting}
          disabled={
            customerStatus === "do_not_call" ||
            (showSchedule && !scheduleFor) ||
            !dialFrom
          }
        >
          {!submitting && <PhoneOutgoing className="h-4 w-4" />}
          {showSchedule ? "Schedule call" : "Call now"}
        </Button>

        <Button
          variant="secondary"
          onClick={() => setShowSchedule((open) => !open)}
          disabled={customerStatus === "do_not_call"}
        >
          <CalendarPlus className="h-4 w-4" />
          {showSchedule ? "Call now instead" : "Schedule for later"}
        </Button>
      </div>

      {!hasAnyNumbers ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {agent.name} has no outbound number yet — go to Settings → Outbound number
          before calling.
        </p>
      ) : dialFrom ? (
        <p className="text-xs text-muted">Will call from {dialFrom}.</p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No outbound number routed for this customer&apos;s area code — set
          one in Settings → Number routing.
        </p>
      )}
    </div>
  );
}

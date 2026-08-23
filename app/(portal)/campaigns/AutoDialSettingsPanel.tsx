"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/Card";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { RETRY_DELAY_OPTIONS } from "@/lib/retry-delay";

const RING_TIMEOUT_OPTIONS = [30, 40, 50];

/**
 * Call cadence and redial/follow-up settings — how long to ring, the gap
 * between calls, and the two-tier retry cycle. Dialing schedules themselves
 * (which dates, which daily time windows) are no longer a separate global
 * setting here — each auto-dial campaign carries its own date range and
 * windows (see CampaignPanel.tsx). Sits above CampaignPanel on the same
 * /campaigns ("Auto-dial") page.
 */
export function AutoDialSettingsPanel({
  agentId,
  ringTimeoutSeconds,
  callGapSeconds,
  retryMaxAttempts,
  retryCycleDelayMinutes,
  retryMaxDays,
}: {
  agentId: string;
  ringTimeoutSeconds: number;
  callGapSeconds: number;
  retryMaxAttempts: number;
  retryCycleDelayMinutes: number;
  retryMaxDays: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [ringTimeout, setRingTimeout] = useState(ringTimeoutSeconds);
  const [callGap, setCallGap] = useState(String(callGapSeconds));
  const [maxAttempts, setMaxAttempts] = useState(String(retryMaxAttempts));
  const [cycleDelay, setCycleDelay] = useState(retryCycleDelayMinutes);
  const [maxDays, setMaxDays] = useState(String(retryMaxDays));
  const [savingField, setSavingField] = useState<string | null>(null);

  async function saveAgentField(field: string, value: number, which: string) {
    setSavingField(which);
    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSavingField(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save.", "error");
      return;
    }
    toast("Saved.", "success");
    router.refresh();
  }

  return (
    <Card className="space-y-6 p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">Auto-Dial Settings</h2>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">Call settings</h3>
        <SelectField
          label="Ring Timeout"
          value={ringTimeout}
          disabled={savingField === "ring"}
          onChange={(e) => {
            const next = Number(e.target.value);
            setRingTimeout(next);
            saveAgentField("ring_timeout_seconds", next, "ring");
          }}
          hint="How long to let a call ring before treating it as no answer. Approximate, not exact — see docs."
        >
          {RING_TIMEOUT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} seconds
            </option>
          ))}
        </SelectField>
        <Field
          label="Delay Between Calls"
          type="number"
          min={0}
          value={callGap}
          disabled={savingField === "gap"}
          onChange={(e) => setCallGap(e.target.value)}
          onBlur={() => {
            const next = Number(callGap);
            if (!Number.isFinite(next) || next < 0) {
              setCallGap(String(callGapSeconds));
              return;
            }
            saveAgentField("call_gap_seconds", next, "gap");
          }}
          hint="Seconds to wait after one call finishes before dialing the next customer."
        />
      </section>

      <hr className="border-border" />

      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">
          Redial / follow-up settings
        </h3>
        <p className="col-span-full -mt-1 text-xs text-muted">
          Immediate retries within a cycle use the Delay Between Calls setting above — the same cadence as dialing the next customer.
        </p>
        <Field
          label="Max Attempts Per Cycle"
          type="number"
          min={0}
          value={maxAttempts}
          disabled={savingField === "attempts"}
          onChange={(e) => setMaxAttempts(e.target.value)}
          onBlur={() => {
            const next = Number(maxAttempts);
            if (!Number.isFinite(next) || next < 0) {
              setMaxAttempts(String(retryMaxAttempts));
              return;
            }
            saveAgentField("retry_max_attempts", next, "attempts");
          }}
          hint="Immediate retries (spaced by Delay Between Calls) before backing off to the Retry Cycle Delay below."
        />
        <SelectField
          label="Retry Cycle Delay"
          value={cycleDelay}
          disabled={savingField === "cycleDelay"}
          onChange={(e) => {
            const next = Number(e.target.value);
            setCycleDelay(next);
            saveAgentField("retry_cycle_delay_minutes", next, "cycleDelay");
          }}
          hint="Wait this long before starting another retry cycle."
        >
          {RETRY_DELAY_OPTIONS.map((option) => (
            <option key={option.minutes} value={option.minutes}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <Field
          label="Maximum Redial Days"
          type="number"
          min={1}
          value={maxDays}
          disabled={savingField === "maxDays"}
          onChange={(e) => setMaxDays(e.target.value)}
          onBlur={() => {
            const next = Number(maxDays);
            if (!Number.isInteger(next) || next <= 0) {
              setMaxDays(String(retryMaxDays));
              return;
            }
            saveAgentField("retry_max_days", next, "maxDays");
          }}
          hint="Auto-retry gives up for good this many days after the first no-answer — or sooner, if the originating campaign's date range ends first."
        />
      </section>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { WEEKDAY_LABELS } from "./calendar-dates";
import type { AgentAvailabilityHour } from "@/types/database";

type Range = { start: string; end: string };

function emptyWeek(): Range[][] {
  return WEEKDAY_LABELS.map(() => []);
}

function fromInitial(
  hours: Pick<AgentAvailabilityHour, "weekday" | "start_time" | "end_time">[]
): Range[][] {
  const week = emptyWeek();
  for (const hour of hours) {
    week[hour.weekday]?.push({
      start: hour.start_time.slice(0, 5),
      end: hour.end_time.slice(0, 5),
    });
  }
  return week;
}

export function AvailabilityEditor({
  agentId,
  initialHours,
  timezoneLabel,
}: {
  agentId: string;
  initialHours: Pick<AgentAvailabilityHour, "weekday" | "start_time" | "end_time">[];
  timezoneLabel: string;
}) {
  const toast = useToast();
  const [week, setWeek] = useState<Range[][]>(() => fromInitial(initialHours));
  const [saving, setSaving] = useState(false);

  function updateRange(day: number, index: number, patch: Partial<Range>) {
    setWeek((current) =>
      current.map((ranges, d) =>
        d !== day ? ranges : ranges.map((r, i) => (i === index ? { ...r, ...patch } : r))
      )
    );
  }

  function addRange(day: number) {
    setWeek((current) =>
      current.map((ranges, d) =>
        d !== day ? ranges : [...ranges, { start: "09:00", end: "17:00" }]
      )
    );
  }

  function removeRange(day: number, index: number) {
    setWeek((current) =>
      current.map((ranges, d) => (d !== day ? ranges : ranges.filter((_, i) => i !== index)))
    );
  }

  function copyToAllDays(day: number) {
    setWeek((current) => current.map(() => current[day].map((r) => ({ ...r }))));
    toast(`${WEEKDAY_LABELS[day]}'s hours copied to every day.`, "success");
  }

  async function handleSave() {
    for (const ranges of week) {
      for (const range of ranges) {
        if (range.end <= range.start) {
          toast("Each range's end time must be after its start time.", "error");
          return;
        }
      }
    }

    setSaving(true);
    const payload = week.flatMap((ranges, weekday) =>
      ranges.map((r) => ({ weekday, start_time: r.start, end_time: r.end }))
    );

    const res = await fetch(`/api/agents/${agentId}/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: payload }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save your availability.", "error");
      return;
    }

    toast("Availability saved.", "success");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Weekly hours</h3>
        <p className="mt-1 text-xs text-muted">
          Set when you&apos;re typically available for meetings.
        </p>
      </div>

      <div className="space-y-2">
        {WEEKDAY_LABELS.map((label, day) => (
          <div key={label} className="flex items-start gap-3 py-1.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar text-xs font-medium text-sidebar-foreground-active">
              {label[0]}
            </span>

            {week[day].length === 0 ? (
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="text-sm text-muted">Unavailable</span>
                <button
                  type="button"
                  onClick={() => addRange(day)}
                  className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add hours
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-1.5">
                {week[day].map((range, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) => updateRange(day, index, { start: e.target.value })}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                    <span className="text-muted">–</span>
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateRange(day, index, { end: e.target.value })}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                    <button
                      type="button"
                      onClick={() => removeRange(day, index)}
                      aria-label="Remove this range"
                      className="text-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {index === week[day].length - 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => addRange(day)}
                          aria-label="Add another range"
                          className="text-muted hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToAllDays(day)}
                          aria-label="Copy to all days"
                          title="Copy to all days"
                          className={cn("text-muted hover:text-foreground")}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        Times are in {timezoneLabel} —{" "}
        <Link href="/settings" className="text-accent hover:underline">
          change your time zone in Settings
        </Link>
        .
      </p>

      <Button onClick={handleSave} loading={saving}>
        Save availability
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";

const NO_LIMIT = "none";
/** Largest window offered in the picker — the API itself accepts up to 30. */
const MAX_DAYS = 14;

function optionLabel(days: number) {
  if (days === 0) return "Today only";
  if (days === 1) return "Today and tomorrow";
  return `Today + the next ${days} days`;
}

/**
 * The agent's rolling booking window — how many days ahead Riley may book
 * off their weekly hours. Counted from "today" on every call, so it's
 * set once rather than moved along each day.
 */
export function BookingWindowForm({
  agentId,
  initialDays,
}: {
  agentId: string;
  initialDays: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initialDays === null ? NO_LIMIT : String(initialDays));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_window_days: value === NO_LIMIT ? null : Number(value) }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save your booking window.", "error");
      return;
    }

    toast("Booking window saved.", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold">Booking window</h3>

      <SelectField
        label="Book appointments for"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value={NO_LIMIT}>Any day (no limit)</option>
        {Array.from({ length: MAX_DAYS + 1 }, (_, days) => (
          <option key={days} value={days}>
            {optionLabel(days)}
          </option>
        ))}
      </SelectField>

      <Button type="submit" loading={saving}>
        Save booking window
      </Button>

      <div>
        <p className="text-xs text-muted">
          How far ahead Riley books for you. It rolls forward by itself every day.
        </p>
        <p className="mt-1 text-xs text-muted">
          A customer who wants a later day isn&apos;t booked — Riley offers what&apos;s open inside
          the window or arranges to call them back. Applies to your weekly hours; appointments you
          add by hand aren&apos;t limited.
        </p>
      </div>
    </form>
  );
}

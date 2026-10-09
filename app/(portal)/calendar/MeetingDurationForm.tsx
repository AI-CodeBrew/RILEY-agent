"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";

/**
 * How long each appointment Riley books for the agent lasts — 30 or 60
 * minutes. Riley only offers times where a meeting of that length fits.
 */
export function MeetingDurationForm({
  agentId,
  initialMinutes,
}: {
  agentId: string;
  initialMinutes: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(String(initialMinutes));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_duration_minutes: Number(value) }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save your meeting length.", "error");
      return;
    }

    toast("Meeting length saved.", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold">Meeting length</h3>

      <SelectField
        label="Each appointment lasts"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="30">30 minutes</option>
        <option value="60">1 hour</option>
      </SelectField>

      <Button type="submit" loading={saving}>
        Save meeting length
      </Button>

      <div>
        <p className="text-xs text-muted">
          Riley only offers times where a full meeting of this length fits inside your hours,
          with a 30-minute gap kept between appointments.
        </p>
        <p className="mt-1 text-xs text-muted">
          On Calendly, Riley books the event type with a matching length if you have one.
        </p>
      </div>
    </form>
  );
}

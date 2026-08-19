"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "@/lib/status-badge";
import type { CustomerStatus } from "@/types/database";

const STATUS_OPTIONS: { value: CustomerStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "call_scheduled", label: "Call scheduled" },
  { value: "calling", label: "Calling" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment_set", label: "Appointment set" },
  { value: "follow_up", label: "Follow up" },
  { value: "no_answer", label: "No answer" },
  { value: "not_interested", label: "Not interested" },
  { value: "do_not_call", label: "Do not call" },
  { value: "sold", label: "Sold" },
];

/** Lets an agent set a customer's status directly from the detail page, without opening the full edit form. */
export function StatusSelect({
  customerId,
  status,
}: {
  customerId: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: CustomerStatus) {
    const previous = value;
    setValue(next);
    setSaving(true);

    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    setSaving(false);

    if (!res.ok) {
      setValue(previous);
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not update status.", "error");
      return;
    }

    toast("Status updated.", "success");
    router.refresh();
  }

  const style = STATUS_STYLES[value] ?? "bg-zinc-500/10 text-zinc-600";

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as CustomerStatus)}
      aria-label="Customer status"
      className={cn(
        "cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none transition-shadow focus:ring-2 focus:ring-accent-soft disabled:cursor-wait disabled:opacity-60",
        style
      )}
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value} className="bg-surface text-foreground">
          {option.label}
        </option>
      ))}
    </select>
  );
}

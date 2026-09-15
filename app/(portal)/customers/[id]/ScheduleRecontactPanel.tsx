"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Customer, CustomerStatus } from "@/types/database";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

// Same set/labels as StatusSelect.tsx — kept as its own local copy rather
// than a shared import, matching how STATUS_FILTERS (customers/page.tsx) and
// STATUS_OPTIONS (StatusSelect.tsx) already each keep their own.
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

/** Rough month count for pre-selecting the dropdown on load — the stored date (next_contact_at, shown separately below) is always the source of truth. */
function approximateMonthsUntil(iso: string): number {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return Math.min(12, Math.max(1, Math.round(days / 30.44)));
}

/**
 * The "after this call" panel: set the customer's new category, and
 * optionally schedule them to automatically become eligible again in the
 * Auto Dialer after a chosen number of months — see
 * app/(portal)/campaigns/CampaignPanel.tsx's "Select due recontacts" quick-
 * select, which is what actually picks these customers up once due; nothing
 * dials them automatically on its own. Independent of the follow_up/
 * no_answer auto-retry chain (customers.next_retry_at), which only ever
 * fires from within a campaign.
 */
export function ScheduleRecontactPanel({
  customerId,
  customerName,
  customerStatus,
  nextContactAt,
  timezone,
  canDial,
}: {
  customerId: string;
  customerName: string;
  customerStatus: Customer["status"];
  nextContactAt: string | null;
  timezone: string;
  /** False when there's no live call to dial into, no outbound number connected, or none routed for this customer's area code — mirrors TriggerCallPanel's own guard. */
  canDial: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<CustomerStatus>(customerStatus);
  const [selected, setSelected] = useState<string>(
    nextContactAt ? String(approximateMonthsUntil(nextContactAt)) : "none"
  );
  const [scheduledAt, setScheduledAt] = useState(nextContactAt);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [dialing, setDialing] = useState(false);

  const disabled = status === "do_not_call";

  async function handleStatusChange(next: CustomerStatus) {
    const previous = status;
    setStatus(next);
    setStatusSaving(true);

    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    setStatusSaving(false);

    if (!res.ok) {
      setStatus(previous);
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not update status.", "error");
      return;
    }

    toast("Status updated.", "success");
    router.refresh();
  }

  async function handleScheduleChange(value: string) {
    const previousSelected = selected;
    const previousScheduledAt = scheduledAt;
    setSelected(value);
    setSaving(true);

    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_again_months: value === "none" ? null : Number(value),
      }),
    });

    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setSelected(previousSelected);
      setScheduledAt(previousScheduledAt);
      toast(body.error ?? "Could not update the contact-again schedule.", "error");
      return;
    }

    setScheduledAt(body.customer?.next_contact_at ?? null);
    toast(
      value === "none"
        ? "Won't contact again automatically."
        : `Scheduled to contact again in ${value} month${value === "1" ? "" : "s"}.`,
      "success"
    );
    router.refresh();
  }

  async function handleDialNow() {
    setDialing(true);
    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    const body = await res.json().catch(() => ({}));
    setDialing(false);

    if (!res.ok) {
      toast(body.error ?? "Failed to start call", "error");
      return;
    }

    toast(`Calling ${customerName}…`, "success");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="new-category" className="block text-xs font-medium text-muted">
            Category
          </label>
          <select
            id="new-category"
            value={status}
            disabled={statusSaving}
            onChange={(e) => handleStatusChange(e.target.value as CustomerStatus)}
            className="mt-1.5 cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="contact-again" className="block text-xs font-medium text-muted">
            Contact again
          </label>
          <select
            id="contact-again"
            value={selected}
            disabled={saving || disabled}
            onChange={(e) => handleScheduleChange(e.target.value)}
            className="mt-1.5 cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="none">Don&apos;t contact again</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} Month{m === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="secondary"
          onClick={handleDialNow}
          loading={dialing}
          disabled={disabled || !canDial}
        >
          {!dialing && <PhoneOutgoing className="h-4 w-4" />}
          Dial now
        </Button>
      </div>

      {disabled ? (
        <p className="text-xs text-muted">
          This customer is marked do-not-call — no automatic recontact will be scheduled.
        </p>
      ) : scheduledAt ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CalendarClock className="h-3.5 w-3.5" />
          Next scheduled contact: {formatDateTime(scheduledAt, timezone)} ({formatRelative(scheduledAt)})
        </p>
      ) : (
        <p className="text-xs text-muted">No automatic recontact scheduled.</p>
      )}
    </div>
  );
}

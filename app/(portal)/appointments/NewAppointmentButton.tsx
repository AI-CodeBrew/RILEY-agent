"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

/**
 * Manual booking — for meetings an agent set up themselves (call-back,
 * inbound, email) so the appointments tab is the single source of truth
 * rather than "Riley's bookings only".
 */
export function NewAppointmentButton({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_id: "",
    scheduled_at: "",
    duration_minutes: "30",
    zoom_link: "",
    notes: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create the appointment.");
      return;
    }

    setOpen(false);
    setForm({
      customer_id: "",
      scheduled_at: "",
      duration_minutes: "30",
      zoom_link: "",
      notes: "",
    });
    toast("Appointment added.", "success");
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={customers.length === 0}>
        <CalendarPlus className="h-4 w-4" />
        Add appointment
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add appointment"
        description="Logs a meeting you booked yourself. It won't create a Calendly event — paste the join link if you have one."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <SelectField
            label="Customer"
            required
            value={form.customer_id}
            onChange={(e) => update("customer_id", e.target.value)}
          >
            <option value="">Select a customer…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </SelectField>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Date and time"
              type="datetime-local"
              required
              value={form.scheduled_at}
              onChange={(e) => update("scheduled_at", e.target.value)}
            />
            <Field
              label="Duration (minutes)"
              type="number"
              min={5}
              step={5}
              value={form.duration_minutes}
              onChange={(e) => update("duration_minutes", e.target.value)}
            />
          </div>

          <Field
            label="Meeting link"
            value={form.zoom_link}
            onChange={(e) => update("zoom_link", e.target.value)}
            placeholder="https://zoom.us/j/…"
          />

          <TextareaField
            label="Notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add appointment
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

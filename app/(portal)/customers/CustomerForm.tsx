"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, TextareaField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

/**
 * "Add customer" — a modal so the list stays the focus of the page. Only
 * sales agents see this; a new customer is always filed under whoever added
 * it, because they're the one who'll be calling.
 */
export function CustomerForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    notes: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add customer");
      return;
    }

    setForm({ name: "", phone: "", email: "", company: "", notes: "" });
    setOpen(false);
    toast(`${form.name} added.`, "success");
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add customer
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add customer"
        description="Riley will call this number when you trigger an outbound call."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Jane Doe"
            />
            <Field
              label="Phone"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(555) 123-4567"
              hint="US numbers are fine without a country code."
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="jane@example.com"
              hint="Needed to send the booking confirmation."
            />
            <Field
              label="Company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Optional"
            />
          </div>

          <TextareaField
            label="Notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Anything the agent should know before the call."
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {!submitting && <UserPlus className="h-4 w-4" />}
              {submitting ? "Adding…" : "Add customer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, TextareaField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

/** Opened from the header's "Contact Us" link — replaces the old #contact anchor scroll. */
export function ContactFormModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address: "",
    comment: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong — please try again.");
      return;
    }

    setForm({
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: "",
      comment: "",
    });
    toast("Thanks — we'll be in touch shortly.", "success");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contact Us"
      description="Tell us a bit about yourself and we'll get back to you."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="First name"
            required
            value={form.first_name}
            onChange={(e) => update("first_name", e.target.value)}
            placeholder="Jane"
          />
          <Field
            label="Last name"
            required
            value={form.last_name}
            onChange={(e) => update("last_name", e.target.value)}
            placeholder="Doe"
          />
          <Field
            label="Phone number"
            type="tel"
            required
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(000) 000-0000"
          />
          <Field
            label="E-mail"
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="jane@example.com"
          />
        </div>

        <Field
          label="Address"
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="12 Main St, City, State, Postal Code"
        />

        <TextareaField
          label="Comment"
          value={form.comment}
          onChange={(e) => update("comment", e.target.value)}
          placeholder="How can we help?"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {!submitting && <Send className="h-4 w-4" />}
            {submitting ? "Sending…" : "Submit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

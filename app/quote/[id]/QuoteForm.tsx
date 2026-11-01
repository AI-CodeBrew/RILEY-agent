"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

/**
 * The lead's side of a lead-gen order: contact details plus the two consent
 * boxes, both unticked by default. Calls consent is required; messages
 * consent is optional.
 */
export function QuoteForm({ orderId, consent }: { orderId: string; consent: { calls: string; messages: string } }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    consent_calls: false,
    consent_messages: false,
    website: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.consent_calls) {
      setError("Please tick the first box so a licensed agent can call you.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/lead-gen/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, order_id: orderId }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't send your request — please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold">Thanks for your request!</h2>
        <p className="mt-1 text-sm">
          Your request has been received. We will contact you shortly to schedule an appointment of yours with a
          licensed agent.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          name="first_name"
          required
          autoComplete="given-name"
          value={form.first_name}
          onChange={(e) => set("first_name", e.target.value)}
        />
        <Field
          label="Last name"
          name="last_name"
          required
          autoComplete="family-name"
          value={form.last_name}
          onChange={(e) => set("last_name", e.target.value)}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>

      {/* Honeypot — hidden from people, see /api/lead-gen/leads. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={form.website}
        onChange={(e) => set("website", e.target.value)}
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          checked={form.consent_calls}
          onChange={(e) => set("consent_calls", e.target.checked)}
        />
        <span>{consent.calls}</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          checked={form.consent_messages}
          onChange={(e) => set("consent_messages", e.target.checked)}
        />
        <span>{consent.messages}</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" loading={submitting} className="w-full sm:w-auto">
        Submit request
      </Button>
    </form>
  );
}

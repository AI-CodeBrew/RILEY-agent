"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

export function RegisterForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        // Best-effort guess so times render sensibly from the first login;
        // changeable later under Settings > Profile.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not complete registration.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
        <div>
          <p className="text-sm font-medium">Registration received</p>
          <p className="mt-1 text-sm text-muted">
            An admin has to approve your account before you can sign in. You&apos;ll
            be able to log in with this email once they do.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-sm text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Full name"
        name="name"
        required
        autoComplete="name"
        value={form.name}
        onChange={(e) => update("name", e.target.value)}
        placeholder="Alex Morgan"
      />
      <Field
        label="Work email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={form.email}
        onChange={(e) => update("email", e.target.value)}
        placeholder="alex@company.com"
      />
      <Field
        label="Phone"
        name="phone"
        value={form.phone}
        onChange={(e) => update("phone", e.target.value)}
        placeholder="Optional — for your own reference"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        value={form.password}
        onChange={(e) => update("password", e.target.value)}
        placeholder="••••••••"
        hint="At least 8 characters."
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={submitting}>
        {!submitting && <UserPlus className="h-4 w-4" />}
        {submitting ? "Sending…" : "Request access"}
      </Button>
    </form>
  );
}

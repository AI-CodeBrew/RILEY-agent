"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";

export function PasswordForm() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not change your password.");
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    toast("Password changed.", "success");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field
        label="Current password"
        type="password"
        required
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="New password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint="At least 8 characters."
      />
      <Field
        label="Confirm new password"
        type="password"
        required
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" loading={saving}>
        Change password
      </Button>
    </form>
  );
}

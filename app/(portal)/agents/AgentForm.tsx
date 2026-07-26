"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

function suggestPassword() {
  // Readable, high-entropy starting password the admin can hand over — the
  // agent changes it from /settings on first sign-in.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll(/[+/=]/g, "x");
}

export function AgentForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "agent",
    calendly_url: "",
    calendly_access_token: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openForm() {
    setForm((current) => ({ ...current, password: suggestPassword() }));
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add agent");
      return;
    }

    toast(
      `${form.name} can sign in with ${form.email} — send them the starting password.`,
      "success"
    );
    setForm({
      name: "",
      email: "",
      password: "",
      role: "agent",
      calendly_url: "",
      calendly_access_token: "",
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={openForm}>
        <UserPlus className="h-4 w-4" />
        Add agent
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add sales agent"
        description="Creates their portal login and their own book of customers."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Alex Rivera"
            />
            <Field
              label="Work email (their username)"
              required
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="alex@company.com"
            />
            <Field
              label="Starting password"
              required
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              hint="Share it once — they can change it under Settings."
            />
            <SelectField
              label="Role"
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              hint="Admins see every agent's customers and calls."
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </SelectField>
            <Field
              label="Calendly scheduling URL"
              value={form.calendly_url}
              onChange={(e) => update("calendly_url", e.target.value)}
              placeholder="https://calendly.com/alex"
            />
            <Field
              label="Calendly personal access token"
              type="password"
              value={form.calendly_access_token}
              onChange={(e) => update("calendly_access_token", e.target.value)}
              placeholder="eyJraWQ…"
            />
          </div>

          <p className="text-xs text-muted">
            The Calendly token comes from Integrations → API &amp; Webhooks. It&apos;s
            validated against Calendly and stored so the voice agent can check
            availability and book on this agent&apos;s behalf. They can also connect
            it themselves later from Settings.
          </p>

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
              {submitting ? "Creating…" : "Create agent"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

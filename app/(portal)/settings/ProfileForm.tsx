"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { CanadaTimezoneSelect } from "@/components/CanadaTimezoneSelect";
import { DEFAULT_CANADA_TIMEZONE, normalizeCanadaTimezone } from "@/lib/canada-timezones";
import { useToast } from "@/components/Toast";

export function ProfileForm({
  agent,
}: {
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    timezone: string;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: agent.name,
    email: agent.email,
    phone: agent.phone ?? "",
    timezone: normalizeCanadaTimezone(agent.timezone),
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save your profile.", "error");
      return;
    }

    toast("Profile saved.", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field
        label="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        hint="Riley introduces itself as calling on your behalf, using this name."
      />
      <Field
        label="Sign-in email"
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <Field
        label="Your phone"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        placeholder="Optional — for your own reference"
      />
      <CanadaTimezoneSelect
        label="Time zone"
        hint="Match your Calendly account time zone. All portal times and your calendar use this zone."
        value={form.timezone}
        onChange={(timezone) => setForm({ ...form, timezone })}
      />

      <Button type="submit" loading={saving}>
        Save profile
      </Button>
    </form>
  );
}

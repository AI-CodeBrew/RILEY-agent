"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

export function AgentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [calendlyToken, setCalendlyToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        calendly_url: calendlyUrl,
        calendly_access_token: calendlyToken,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add agent");
      return;
    }

    setName("");
    setEmail("");
    setCalendlyUrl("");
    setCalendlyToken("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex Rivera"
        />
        <Field
          label="Email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@company.com"
        />
        <Field
          label="Calendly scheduling URL"
          value={calendlyUrl}
          onChange={(e) => setCalendlyUrl(e.target.value)}
          placeholder="https://calendly.com/alex"
        />
        <Field
          label="Calendly personal access token"
          type="password"
          value={calendlyToken}
          onChange={(e) => setCalendlyToken(e.target.value)}
          placeholder="eyJraWQ..."
        />
      </div>
      <p className="text-xs text-muted">
        Generate a personal access token from your Calendly account under
        Integrations → API &amp; Webhooks. It&apos;s validated against
        Calendly and stored so Edge Functions can check availability and book
        events on this agent&apos;s behalf.
      </p>
      <Button type="submit" disabled={submitting}>
        <UserPlus className="h-4 w-4" />
        {submitting ? "Saving…" : "Add sales agent"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

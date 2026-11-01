"use client";

import { useState } from "react";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import {
  GENDER_LABELS,
  LICENSE_REGIONS,
  MIN_BUDGET_CENTS,
  PRODUCT_LABELS,
  formatCents,
  regionName,
} from "@/lib/lead-gen";
import type { LeadGenProduct } from "@/types/database";

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {step}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

/**
 * The agent's order form: who the leads should be, where the agent is
 * licensed (shown to leads in the consent wording), and a budget. Submitting
 * saves the order and redirects to Stripe Checkout for exactly that budget;
 * the team takes it live once it's paid.
 */
export function LeadGenOrderForm({ agentName }: { agentName: string }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    product: "" as LeadGenProduct | "",
    location: "",
    gender: "any",
    age_min: "",
    age_max: "",
    licensed_regions: [] as string[],
    agency_name: agentName,
    budget: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addRegion(code: string) {
    if (code && !form.licensed_regions.includes(code)) {
      set("licensed_regions", [...form.licensed_regions, code]);
    }
  }

  function removeRegion(code: string) {
    set("licensed_regions", form.licensed_regions.filter((r) => r !== code));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.licensed_regions.length === 0) {
      setError("Choose at least one province or state you're licensed in.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/lead-gen/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body.url) {
      setSubmitting(false);
      setError(body.error ?? "Couldn't start checkout.");
      toast(body.error ?? "Couldn't start checkout.", "error");
      return;
    }

    window.location.href = body.url;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section step={1} title="Leads" description="What the leads are looking for and who they should be.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Product"
            name="product"
            required
            value={form.product}
            onChange={(e) => set("product", e.target.value as LeadGenProduct)}
          >
            <option value="" disabled>Choose a product</option>
            {Object.entries(PRODUCT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          <Field
            label="Location"
            name="location"
            placeholder="e.g. Toronto, Mississauga, Brampton"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
          <SelectField
            label="Gender"
            name="gender"
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Age from"
              name="age_min"
              type="number"
              min={18}
              max={100}
              placeholder="18"
              value={form.age_min}
              onChange={(e) => set("age_min", e.target.value)}
            />
            <Field
              label="Age to"
              name="age_max"
              type="number"
              min={18}
              max={100}
              placeholder="100"
              value={form.age_max}
              onChange={(e) => set("age_max", e.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section
        step={2}
        title="Licensing"
        description="Leads see this name and these provinces/states in the consent they agree to."
      >
        <div className="space-y-4">
          <div>
            <SelectField
              label="Agent licensed in provinces"
              name="licensed_region"
              value=""
              onChange={(e) => addRegion(e.target.value)}
            >
              <option value="">Add a province or state…</option>
              <optgroup label="Canada">
                {LICENSE_REGIONS.filter((r) => r.code.startsWith("CA-")).map((r) => (
                  <option key={r.code} value={r.code} disabled={form.licensed_regions.includes(r.code)}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="United States">
                {LICENSE_REGIONS.filter((r) => r.code.startsWith("US-")).map((r) => (
                  <option key={r.code} value={r.code} disabled={form.licensed_regions.includes(r.code)}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            </SelectField>
            {form.licensed_regions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.licensed_regions.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  >
                    {regionName(code)}
                    <button
                      type="button"
                      onClick={() => removeRegion(code)}
                      aria-label={`Remove ${regionName(code)}`}
                      className="opacity-80 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <Field
            label="Agent/agency name"
            name="agency_name"
            required
            value={form.agency_name}
            onChange={(e) => set("agency_name", e.target.value)}
          />
        </div>
      </Section>

      <Section step={3} title="Budget" description="How much to spend on this order. You'll pay it once by card on the next screen.">
        <div className="max-w-xs">
          <Field
            label="Budget (CAD)"
            name="budget"
            type="number"
            required
            min={MIN_BUDGET_CENTS / 100}
            step="0.01"
            placeholder="500"
            hint={`Minimum ${formatCents(MIN_BUDGET_CENTS)}.`}
            value={form.budget}
            onChange={(e) => set("budget", e.target.value)}
          />
        </div>
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          <CreditCard className="h-4 w-4" />
          Pay{form.budget && Number(form.budget) > 0 ? ` ${formatCents(Math.round(Number(form.budget) * 100))}` : ""}
        </Button>
      </div>
    </form>
  );
}

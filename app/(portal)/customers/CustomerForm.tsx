"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { CanadaTimezoneSelect } from "@/components/CanadaTimezoneSelect";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { DEFAULT_CANADA_TIMEZONE } from "@/lib/canada-timezones";
import { CALL_TYPES, type CallType } from "@/types/database";

const CALL_TYPE_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

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
    timezone: DEFAULT_CANADA_TIMEZONE,
    call_type: "",
    province: "",
    kit_count: "",
    mailing_address: "",
    request_date: "",
    date_of_birth: "",
    beneficiary_name: "",
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

    setForm({
      name: "",
      phone: "",
      email: "",
      company: "",
      notes: "",
      timezone: DEFAULT_CANADA_TIMEZONE,
      call_type: "",
      province: "",
      kit_count: "",
      mailing_address: "",
      request_date: "",
      date_of_birth: "",
      beneficiary_name: "",
    });
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
              placeholder="+923001234567"
              hint="Use +country code. Pakistan: +92… or 0300…. UK: +44… or 07…."
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
            <CanadaTimezoneSelect
              label="Member time zone"
              hint="Abby offers appointment times in this zone (e.g. Nova Scotia → Atlantic)."
              value={form.timezone}
              onChange={(timezone) => update("timezone", timezone)}
              required
            />
            <SelectField
              label="Call type"
              hint="Which script Riley follows on this customer's call."
              value={form.call_type}
              onChange={(e) => update("call_type", e.target.value)}
            >
              <option value="">Not set</option>
              {CALL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CALL_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
          </div>

          {/* The will-kit request itself. Riley reads these back to confirm
              them on the call and skips anything left blank here, so a gap is
              a question the lead gets asked rather than a wrong statement. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Province / state"
              value={form.province}
              onChange={(e) => update("province", e.target.value)}
              placeholder="Ontario"
            />
            <Field
              label="Will kits requested"
              type="number"
              min={1}
              max={10}
              value={form.kit_count}
              onChange={(e) => update("kit_count", e.target.value)}
              placeholder="1"
              hint="Two usually means a spouse or partner is included."
            />
            <Field
              label="Request date"
              type="date"
              value={form.request_date}
              onChange={(e) => update("request_date", e.target.value)}
              hint="When they submitted the online request."
            />
            <Field
              label="Mailing address"
              value={form.mailing_address}
              onChange={(e) => update("mailing_address", e.target.value)}
              placeholder="12 Main St, Toronto"
            />
            <Field
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              hint="Abby confirms this near the top of the call."
            />
            <Field
              label="Beneficiary name"
              value={form.beneficiary_name}
              onChange={(e) => update("beneficiary_name", e.target.value)}
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

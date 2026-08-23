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
    first_name: "",
    middle_name: "",
    last_name: "",
    phone: "",
    home_telephone: "",
    cellular_phone: "",
    email: "",
    company: "",
    notes: "",
    timezone: DEFAULT_CANADA_TIMEZONE,
    call_type: "",
    province: "",
    city: "",
    postal_code: "",
    kit_count: "",
    mailing_address: "",
    request_date: "",
    date_of_birth: "",
    customer_since: "",
    beneficiary_name: "",
    relationship: "",
    shift: "",
    preferred_meeting_time: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    // No standalone "Name" input — the full display name is derived from
    // First/Middle/Last, which is why those two are required below.
    const fullName = [form.first_name, form.middle_name, form.last_name]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, name: fullName }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add customer");
      return;
    }

    setForm({
      first_name: "",
      middle_name: "",
      last_name: "",
      phone: "",
      home_telephone: "",
      cellular_phone: "",
      email: "",
      company: "",
      notes: "",
      timezone: DEFAULT_CANADA_TIMEZONE,
      call_type: "",
      province: "",
      city: "",
      postal_code: "",
      kit_count: "",
      mailing_address: "",
      request_date: "",
      date_of_birth: "",
      customer_since: "",
      beneficiary_name: "",
      relationship: "",
      shift: "",
      preferred_meeting_time: "",
    });
    setOpen(false);
    toast(`${fullName} added.`, "success");
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
              label="First name"
              required
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
              placeholder="Jane"
              hint="Combined with Middle/Last for the display name shown everywhere in the app and used on the call."
            />
            <Field
              label="Middle name"
              value={form.middle_name}
              onChange={(e) => update("middle_name", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="Last name"
              required
              value={form.last_name}
              onChange={(e) => update("last_name", e.target.value)}
              placeholder="Doe"
            />
            <Field
              label="Phone"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+923001234567"
              hint="Use +country code. Pakistan: +92… or 0300…. UK: +44… or 07…. This is the number Riley actually calls."
            />
            <Field
              label="Email Address"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="jane@example.com"
              hint="Needed to send the booking confirmation."
            />
            <Field
              label="Home Telephone"
              value={form.home_telephone}
              onChange={(e) => update("home_telephone", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="Cellular Phone Number"
              value={form.cellular_phone}
              onChange={(e) => update("cellular_phone", e.target.value)}
              placeholder="Optional"
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
              label="Home Address"
              value={form.mailing_address}
              onChange={(e) => update("mailing_address", e.target.value)}
              placeholder="12 Main St"
            />
            <Field
              label="City"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="State/Province"
              value={form.province}
              onChange={(e) => update("province", e.target.value)}
              placeholder="Ontario"
            />
            <Field
              label="Postal Code"
              value={form.postal_code}
              onChange={(e) => update("postal_code", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="Requested # of Kit(s)"
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
              label="Date of Birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              hint="Abby confirms this near the top of the call."
            />
            <Field
              label="Customer Since"
              type="date"
              value={form.customer_since}
              onChange={(e) => update("customer_since", e.target.value)}
              hint="When they became a client — lets the bot say how long they've been with us."
            />
            <Field
              label="Beneficiary"
              value={form.beneficiary_name}
              onChange={(e) => update("beneficiary_name", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="Relationship"
              value={form.relationship}
              onChange={(e) => update("relationship", e.target.value)}
              placeholder="e.g. Spouse, Child"
            />
            <Field
              label="Shift"
              value={form.shift}
              onChange={(e) => update("shift", e.target.value)}
              placeholder="Optional"
            />
            <Field
              label="Best Time to Call"
              value={form.preferred_meeting_time}
              onChange={(e) => update("preferred_meeting_time", e.target.value)}
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/Button";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { CanadaTimezoneSelect } from "@/components/CanadaTimezoneSelect";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { normalizeCanadaTimezone } from "@/lib/canada-timezones";
import { CALL_TYPES, type CallType, type CustomerStatus } from "@/types/database";

const STATUSES: { value: CustomerStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "call_scheduled", label: "Call scheduled" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment_set", label: "Appointment set" },
  { value: "follow_up", label: "Follow up" },
  { value: "no_answer", label: "No answer" },
  { value: "not_interested", label: "Not interested" },
  { value: "do_not_call", label: "Do not call" },
  { value: "sold", label: "Sold" },
];

const CALL_TYPE_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

export function CustomerEditor({
  customer,
  agents,
  fieldsHiddenForRole = false,
}: {
  customer: {
    id: string;
    name: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    phone: string;
    home_telephone: string | null;
    cellular_phone: string | null;
    email: string | null;
    company: string | null;
    notes: string | null;
    status: CustomerStatus;
    agent_id: string | null;
    timezone: string | null;
    province: string | null;
    city: string | null;
    postal_code: string | null;
    kit_count: number | null;
    mailing_address: string | null;
    request_date: string | null;
    date_of_birth: string | null;
    customer_since: string | null;
    beneficiary_name: string | null;
    relationship: string | null;
    shift: string | null;
    preferred_meeting_time: string | null;
    call_type: CallType | null;
  };
  /** Admins only — reassigning a customer moves the whole record. */
  agents?: { id: string; name: string }[];
  /** True for an agent session — last_name/phone/home_telephone/cellular_phone are redacted server-side (see lib/customer-visibility.ts) and hidden from this form entirely once the customer exists; an agent only ever sets them at creation time (CustomerForm.tsx), never after. */
  fieldsHiddenForRole?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ field: string; name: string } | null>(null);
  const [form, setForm] = useState({
    first_name: customer.first_name ?? "",
    middle_name: customer.middle_name ?? "",
    last_name: customer.last_name ?? "",
    phone: customer.phone,
    home_telephone: customer.home_telephone ?? "",
    cellular_phone: customer.cellular_phone ?? "",
    email: customer.email ?? "",
    company: customer.company ?? "",
    notes: customer.notes ?? "",
    status: customer.status as string,
    agent_id: customer.agent_id ?? "",
    timezone: normalizeCanadaTimezone(customer.timezone),
    province: customer.province ?? "",
    city: customer.city ?? "",
    postal_code: customer.postal_code ?? "",
    kit_count: customer.kit_count?.toString() ?? "",
    mailing_address: customer.mailing_address ?? "",
    request_date: customer.request_date ?? "",
    date_of_birth: customer.date_of_birth ?? "",
    customer_since: customer.customer_since ?? "",
    beneficiary_name: customer.beneficiary_name ?? "",
    relationship: customer.relationship ?? "",
    shift: customer.shift ?? "",
    preferred_meeting_time: customer.preferred_meeting_time ?? "",
    call_type: customer.call_type ?? "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    // A changed phone/email invalidates whatever duplicate was flagged
    // against the old value — force a fresh check on the next save.
    if (duplicate) setDuplicate(null);
  }

  async function save(force: boolean) {
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = { ...form, confirm_duplicate: force };

    // Hidden fields (agent session) aren't rendered above, so form[field] is
    // always "" here — drop them from the payload entirely so the existing
    // value on file is left untouched rather than overwritten with a blank.
    if (fieldsHiddenForRole) {
      for (const field of ["last_name", "phone", "home_telephone", "cellular_phone"] as const) {
        if (form[field] === "") delete payload[field];
      }
    }

    // No standalone "Name" input — re-derive the full display name from
    // First/Middle/Last when any of those changed, but never blank it out:
    // customers created before this field split (or edited without ever
    // touching name parts) fall back to the name already on file. Skipped
    // entirely when last_name is hidden and untouched — recomposing it from
    // first/middle alone would silently drop the real last name from the
    // display name, since the agent can't see it to preserve it.
    if (!fieldsHiddenForRole || "last_name" in payload) {
      const fullName = [form.first_name, form.middle_name, form.last_name]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      payload.name = fullName || customer.name;
    }

    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // agent_id is admin-only server-side; don't send it at all otherwise.
      body: JSON.stringify(
        agents ? payload : { ...payload, agent_id: undefined }
      ),
    });

    setSaving(false);

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body.duplicate) {
        setDuplicate(body.duplicate);
        return;
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save.");
      return;
    }

    setDuplicate(null);
    setOpen(false);
    toast("Customer updated.", "success");
    router.refresh();
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    save(false);
  }

  async function handleDelete() {
    setSaving(true);
    const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not delete this customer.", "error");
      return;
    }

    toast(`${customer.name} deleted.`, "success");
    router.replace("/customers");
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setDuplicate(null);
        }}
        title="Edit customer"
        description="Marking someone do-not-call blocks any further outbound calls."
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="First name"
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
            />
            <Field
              label="Middle name"
              value={form.middle_name}
              onChange={(e) => update("middle_name", e.target.value)}
            />
            {!fieldsHiddenForRole && (
              <Field
                label="Last name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            )}
            {!fieldsHiddenForRole && (
              <Field
                label="Phone"
                required
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                hint="International format, e.g. +923001234567 or 03001234567"
              />
            )}
            {!fieldsHiddenForRole && (
              <Field
                label="Home Telephone"
                value={form.home_telephone}
                onChange={(e) => update("home_telephone", e.target.value)}
              />
            )}
            {!fieldsHiddenForRole && (
              <Field
                label="Cellular Phone Number"
                value={form.cellular_phone}
                onChange={(e) => update("cellular_phone", e.target.value)}
              />
            )}
            <Field
              label="Email Address"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
            <Field
              label="Company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
            />
            <CanadaTimezoneSelect
              label="Member time zone"
              hint="Abby offers appointment times in this zone."
              value={form.timezone}
              onChange={(timezone) => update("timezone", timezone)}
              required
            />
          </div>

          {/* Anything left blank here is a detail Riley asks about on the
              call instead of stating back to the lead. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Home Address"
              value={form.mailing_address}
              onChange={(e) => update("mailing_address", e.target.value)}
            />
            <Field
              label="City"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
            <Field
              label="State/Province"
              value={form.province}
              onChange={(e) => update("province", e.target.value)}
            />
            <Field
              label="Postal Code"
              value={form.postal_code}
              onChange={(e) => update("postal_code", e.target.value)}
            />
            <Field
              label="Requested # of Kit(s)"
              type="number"
              min={1}
              max={10}
              value={form.kit_count}
              onChange={(e) => update("kit_count", e.target.value)}
            />
            <Field
              label="Request date"
              type="date"
              value={form.request_date}
              onChange={(e) => update("request_date", e.target.value)}
            />
            <Field
              label="Date of Birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
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
            />
            <Field
              label="Relationship"
              value={form.relationship}
              onChange={(e) => update("relationship", e.target.value)}
            />
            <Field
              label="Shift"
              value={form.shift}
              onChange={(e) => update("shift", e.target.value)}
            />
            <Field
              label="Best Time to Call"
              value={form.preferred_meeting_time}
              onChange={(e) => update("preferred_meeting_time", e.target.value)}
            />
          </div>

          <SelectField
            label="Status"
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </SelectField>

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

          {agents && (
            <SelectField
              label="Owner"
              value={form.agent_id}
              onChange={(e) => update("agent_id", e.target.value)}
              hint="Only this agent (and admins) can see or call this customer."
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </SelectField>
          )}

          <TextareaField
            label="Notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />

          {duplicate && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              A customer named &quot;{duplicate.name}&quot; already has this {duplicate.field}.
              Save anyway, or change the {duplicate.field} above.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              {duplicate ? (
                <Button
                  type="button"
                  variant="danger"
                  loading={saving}
                  onClick={() => save(true)}
                >
                  Save anyway
                </Button>
              ) : (
                <Button type="submit" loading={saving}>
                  Save changes
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${customer.name}?`}
        description="Their call history and appointments are deleted too. This can't be undone."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={saving}
            >
              Keep customer
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={saving}>
              Delete permanently
            </Button>
          </>
        }
      />
    </>
  );
}

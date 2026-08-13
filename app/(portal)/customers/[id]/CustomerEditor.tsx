"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
];

const CALL_TYPE_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

export function CustomerEditor({
  customer,
  agents,
}: {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    notes: string | null;
    status: CustomerStatus;
    agent_id: string | null;
    timezone: string | null;
    province: string | null;
    kit_count: number | null;
    mailing_address: string | null;
    request_date: string | null;
    date_of_birth: string | null;
    beneficiary_name: string | null;
    call_type: CallType | null;
  };
  /** Admins only — reassigning a customer moves the whole record. */
  agents?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    company: customer.company ?? "",
    notes: customer.notes ?? "",
    status: customer.status as string,
    agent_id: customer.agent_id ?? "",
    timezone: normalizeCanadaTimezone(customer.timezone),
    province: customer.province ?? "",
    kit_count: customer.kit_count?.toString() ?? "",
    mailing_address: customer.mailing_address ?? "",
    request_date: customer.request_date ?? "",
    date_of_birth: customer.date_of_birth ?? "",
    beneficiary_name: customer.beneficiary_name ?? "",
    call_type: customer.call_type ?? "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // agent_id is admin-only server-side; don't send it at all otherwise.
      body: JSON.stringify(
        agents ? form : { ...form, agent_id: undefined }
      ),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save.");
      return;
    }

    setOpen(false);
    toast("Customer updated.", "success");
    router.refresh();
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
        onClose={() => setOpen(false)}
        title="Edit customer"
        description="Marking someone do-not-call blocks any further outbound calls."
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
            <Field
              label="Phone"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              hint="International format, e.g. +923001234567 or 03001234567"
            />
            <Field
              label="Email"
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
              label="Province / state"
              value={form.province}
              onChange={(e) => update("province", e.target.value)}
            />
            <Field
              label="Will kits requested"
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
              label="Mailing address"
              value={form.mailing_address}
              onChange={(e) => update("mailing_address", e.target.value)}
            />
            <Field
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
            />
            <Field
              label="Beneficiary name"
              value={form.beneficiary_name}
              onChange={(e) => update("beneficiary_name", e.target.value)}
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
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
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

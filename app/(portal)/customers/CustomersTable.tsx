"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckSquare, PhoneCall, PhoneOutgoing, Trash2, Users, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Button, LinkButton } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { formatPhone, formatRelative } from "@/lib/format";
import { regionForPhoneNumber, routingRegionLabel } from "@/lib/area-code-routing";
import type { CustomerWithAgent } from "@/types/database";

type ConnectedNumber = { id: string; phoneNumber: string };
type NumberRoute = { region: string; phone_number_id: string };

export function CustomersTable({
  customers,
  numbers,
  routes,
  isAdmin,
  defaultVoiceGender,
  emptyTitle,
  emptyDescription,
}: {
  customers: CustomerWithAgent[];
  numbers: ConnectedNumber[];
  routes: NumberRoute[];
  isAdmin: boolean;
  /** Set on the AI Integration page. Pre-fills the quick-dial voice; still changeable here per call. */
  defaultVoiceGender: "male" | "female" | null;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [voiceGender, setVoiceGender] = useState<"male" | "female">(defaultVoiceGender ?? "female");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectableCustomers = useMemo(
    () => customers.filter((customer) => customer.status !== "calling"),
    [customers]
  );

  const allSelected =
    selectableCustomers.length > 0 &&
    selectableCustomers.every((customer) => selectedIds.has(customer.id));

  const selectedCustomers = useMemo(
    () => customers.filter((customer) => selectedIds.has(customer.id)),
    [customers, selectedIds]
  );

  const numberById = new Map(numbers.map((n) => [n.id, n.phoneNumber]));
  const routeByRegion = new Map(routes.map((r) => [r.region, r.phone_number_id]));

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleOne(customerId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableCustomers.map((customer) => customer.id)));
  }

  async function handleBulkDelete() {
    if (selectedCustomers.length === 0) return;

    setDeleting(true);
    const res = await fetch("/api/customers/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedCustomers.map((customer) => customer.id) }),
    });
    const body = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok) {
      toast(body.error ?? "Could not delete selected customers.", "error");
      return;
    }

    const count = typeof body.deleted === "number" ? body.deleted : selectedCustomers.length;
    toast(
      count === 1
        ? `${selectedCustomers[0]?.name ?? "Customer"} deleted.`
        : `${count} customers deleted.`,
      "success"
    );
    setSelectedIds(new Set());
    setConfirmDelete(false);
    exitSelectionMode();
    router.refresh();
  }

  /** Which connected number this customer would be called from, for a plain-language hint — mirrors lib/number-routing.ts. */
  function willCallFrom(phone: string): string | null {
    const region = regionForPhoneNumber(phone);
    const numberId = routeByRegion.get(region) ?? routeByRegion.get("default");
    const number = numberId ? numberById.get(numberId) : null;
    return number ? `${formatPhone(number)} (${routingRegionLabel(region)})` : null;
  }

  async function handleDial(customerId: string) {
    setDialingId(customerId);
    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, voice_gender: voiceGender }),
    });
    const body = await res.json().catch(() => ({}));
    setDialingId(null);

    if (!res.ok) {
      toast(body.error ?? "Failed to start call", "error");
      return;
    }

    toast("Calling…", "success");
    router.refresh();
  }

  return (
    <>
      <Card className="overflow-hidden">
        {customers.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              {selectionMode ? (
                <>
                  <p className="text-sm text-muted">
                    {selectedCustomers.length > 0 ? (
                      <>
                        <span className="font-medium text-foreground">
                          {selectedCustomers.length}
                        </span>{" "}
                        selected
                      </>
                    ) : (
                      "Tap customers to select"
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={selectedCustomers.length === 0}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">Select customers to delete in bulk.</p>
                  <div className="flex items-center gap-2">
                    {!isAdmin && (
                      <SelectField
                        label="Voice"
                        value={voiceGender}
                        onChange={(e) => setVoiceGender(e.target.value as "male" | "female")}
                        className="py-1.5"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </SelectField>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setSelectionMode(true)}>
                      <CheckSquare className="h-3.5 w-3.5" />
                      Select
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <tr>
                    {selectionMode && (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          disabled={selectableCustomers.length === 0}
                          aria-label="Select all customers"
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    {isAdmin && <th className="px-4 py-3">Owner</th>}
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Call type</th>
                    <th className="px-4 py-3">Last contacted</th>
                    {!selectionMode && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const dialFrom = !isAdmin ? willCallFrom(customer.phone) : null;
                    const isCalling = customer.status === "calling";
                    const isSelected = selectedIds.has(customer.id);

                    return (
                      <tr
                        key={customer.id}
                        className={`border-b border-border last:border-0 hover:bg-background ${
                          isSelected ? "bg-accent-soft/40" : ""
                        } ${selectionMode && !isCalling ? "cursor-pointer" : ""}`}
                        onClick={
                          selectionMode && !isCalling
                            ? () => toggleOne(customer.id)
                            : undefined
                        }
                      >
                        {selectionMode && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isCalling}
                              onChange={() => toggleOne(customer.id)}
                              aria-label={`Select ${customer.name}`}
                              title={
                                isCalling
                                  ? "Wait until the call finishes before deleting"
                                  : undefined
                              }
                              className="h-4 w-4 rounded border-border accent-accent disabled:opacity-40"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={customer.name} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{customer.name}</p>
                              <p className="truncate text-xs text-muted">
                                {customer.company ?? customer.email ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{formatPhone(customer.phone)}</td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-muted">
                            {customer.agent?.name ?? (
                              <span className="text-amber-600 dark:text-amber-400">unassigned</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <StatusBadge status={customer.status} pulse={customer.status === "calling"} />
                          {(customer.status === "follow_up" || customer.status === "no_answer") && (
                            <p className="mt-1 text-xs text-muted">
                              {customer.next_retry_at
                                ? `Auto-retry ${formatRelative(customer.next_retry_at)}`
                                : customer.retry_count > 0
                                  ? "Auto-retry attempts used up"
                                  : null}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={customer.call_type} />
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {customer.last_contacted_at
                            ? formatRelative(customer.last_contacted_at)
                            : "never"}
                        </td>
                        {!selectionMode && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!isAdmin && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={dialingId === customer.id}
                                  disabled={
                                    customer.status === "do_not_call" ||
                                    customer.status === "calling" ||
                                    !dialFrom
                                  }
                                  title={
                                    dialFrom
                                      ? `Will call from ${dialFrom}`
                                      : "No outbound number routed for this area code — set one in Settings"
                                  }
                                  onClick={() => handleDial(customer.id)}
                                >
                                  {dialingId !== customer.id && (
                                    <PhoneOutgoing className="h-3.5 w-3.5" />
                                  )}
                                  Dial
                                </Button>
                              )}
                              <LinkButton href={`/customers/${customer.id}`}>
                                <PhoneCall className="h-3.5 w-3.5" />
                                View
                              </LinkButton>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
        )}
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={
          selectedCustomers.length === 1
            ? `Delete ${selectedCustomers[0]?.name}?`
            : `Delete ${selectedCustomers.length} customers?`
        }
        description="Their call history, appointments, and notes are permanently removed. This can't be undone."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Keep customers
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} loading={deleting}>
              Delete permanently
            </Button>
          </>
        }
      />
    </>
  );
}

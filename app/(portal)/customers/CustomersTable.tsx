"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneCall, PhoneOutgoing, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Button, LinkButton } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { formatPhone, formatRelative } from "@/lib/format";
import type { CustomerWithAgent } from "@/types/database";

type ConnectedNumber = { id: string; phoneNumber: string };

export function CustomersTable({
  customers,
  numbers,
  isAdmin,
  emptyTitle,
  emptyDescription,
}: {
  customers: CustomerWithAgent[];
  numbers: ConnectedNumber[];
  isAdmin: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedNumberId, setSelectedNumberId] = useState(numbers[0]?.id ?? "");
  const [dialingId, setDialingId] = useState<string | null>(null);

  async function handleDial(customerId: string) {
    if (!selectedNumberId) {
      toast("Select a number to call from first.", "error");
      return;
    }

    setDialingId(customerId);
    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, phone_number_id: selectedNumberId }),
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
    <div className="space-y-3">
      {!isAdmin && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="dial-number" className="font-medium text-muted">
            Select number
          </label>
          <select
            id="dial-number"
            value={selectedNumberId}
            onChange={(e) => setSelectedNumberId(e.target.value)}
            disabled={numbers.length === 0}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
          >
            {numbers.length === 0 ? (
              <option value="">No numbers connected</option>
            ) : (
              numbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {formatPhone(number.phoneNumber)}
                </option>
              ))
            )}
          </select>
          {numbers.length === 0 && (
            <a href="/settings" className="text-xs text-accent hover:underline">
              Connect one in Settings
            </a>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        {customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  {isAdmin && <th className="px-4 py-3">Owner</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last contacted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
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
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {customer.last_contacted_at ? formatRelative(customer.last_contacted_at) : "never"}
                    </td>
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
                              !selectedNumberId
                            }
                            onClick={() => handleDial(customer.id)}
                          >
                            {dialingId !== customer.id && <PhoneOutgoing className="h-3.5 w-3.5" />}
                            Dial
                          </Button>
                        )}
                        <LinkButton href={`/customers/${customer.id}`}>
                          <PhoneCall className="h-3.5 w-3.5" />
                          View
                        </LinkButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
        )}
      </Card>
    </div>
  );
}

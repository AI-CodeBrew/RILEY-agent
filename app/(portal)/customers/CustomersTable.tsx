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
import { regionForPhoneNumber, routingRegionLabel } from "@/lib/area-code-routing";
import type { CustomerWithAgent } from "@/types/database";

type ConnectedNumber = { id: string; phoneNumber: string };
type NumberRoute = { region: string; phone_number_id: string };

export function CustomersTable({
  customers,
  numbers,
  routes,
  isAdmin,
  emptyTitle,
  emptyDescription,
}: {
  customers: CustomerWithAgent[];
  numbers: ConnectedNumber[];
  routes: NumberRoute[];
  isAdmin: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialingId, setDialingId] = useState<string | null>(null);

  const numberById = new Map(numbers.map((n) => [n.id, n.phoneNumber]));
  const routeByRegion = new Map(routes.map((r) => [r.region, r.phone_number_id]));

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
      body: JSON.stringify({ customer_id: customerId }),
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
              {customers.map((customer) => {
                const dialFrom = !isAdmin ? willCallFrom(customer.phone) : null;
                return (
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
                              !dialFrom
                            }
                            title={dialFrom ? `Will call from ${dialFrom}` : "No outbound number routed for this area code — set one in Settings"}
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
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
      )}
    </Card>
  );
}

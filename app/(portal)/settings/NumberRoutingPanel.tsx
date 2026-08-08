"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { formatPhone } from "@/lib/format";
import { NUMBER_ROUTING_REGIONS, type RoutingRegion } from "@/lib/area-code-routing";

type ConnectedNumber = { id: string; phoneNumber: string };

const ROWS: { region: RoutingRegion; label: string; areaCodes: string | null }[] = [
  ...NUMBER_ROUTING_REGIONS.map((r) => ({
    region: r.key as RoutingRegion,
    label: r.label,
    areaCodes: r.areaCodes.join(" / "),
  })),
  { region: "default", label: "Default", areaCodes: null },
];

/**
 * Deterministic outbound-number routing by the customer's area code — one
 * connected number per region, plus a Default for anything unmapped. Never
 * a random pick; this is the single source of truth manual dials and
 * auto-dial campaigns both resolve against (lib/number-routing.ts).
 */
export function NumberRoutingPanel({
  agentId,
  numbers,
  initialRoutes,
}: {
  agentId: string;
  numbers: ConnectedNumber[];
  initialRoutes: { region: string; phone_number_id: string }[];
}) {
  const toast = useToast();
  const [routes, setRoutes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of initialRoutes) map[r.region] = r.phone_number_id;
    return map;
  });
  const [savingRegion, setSavingRegion] = useState<string | null>(null);

  async function handleChange(region: RoutingRegion, phoneNumberId: string) {
    setSavingRegion(region);
    const previous = routes[region];
    setRoutes((current) => ({ ...current, [region]: phoneNumberId }));

    const res = await fetch(`/api/agents/${agentId}/number-routes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, phone_number_id: phoneNumberId || null }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingRegion(null);

    if (!res.ok) {
      setRoutes((current) => ({ ...current, [region]: previous ?? "" }));
      toast(body.error ?? "Could not save that routing.", "error");
      return;
    }

    toast("Routing saved.", "success");
  }

  if (numbers.length === 0) {
    return (
      <p className="text-sm text-muted">
        Connect at least one outbound number above before setting up region
        routing.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Riley calls a customer from whichever number is mapped to their area
        code. Area codes with no mapping use Default — never a random
        number.
      </p>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {ROWS.map((row) => (
          <li
            key={row.region}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
          >
            <span className="text-sm font-medium">
              {row.label}
              {row.areaCodes && (
                <span className="ml-1.5 font-normal text-muted">({row.areaCodes})</span>
              )}
            </span>
            <select
              value={routes[row.region] ?? ""}
              onChange={(e) => handleChange(row.region, e.target.value)}
              disabled={savingRegion === row.region}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
            >
              <option value="">Select outbound number</option>
              {numbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {formatPhone(number.phoneNumber)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

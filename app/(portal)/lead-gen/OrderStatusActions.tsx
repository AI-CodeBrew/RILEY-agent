"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Rocket, X } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { LeadGenOrderStatus } from "@/types/database";

/** Admin buttons on a lead-gen order: take a paid order live, or cancel it. */
export function OrderStatusActions({ id, status }: { id: string; status: LeadGenOrderStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState<"live" | "canceled" | null>(null);

  if (status === "live" || status === "canceled") return null;

  async function update(next: "live" | "canceled") {
    if (next === "canceled" && !confirm("Cancel this order? Refunds are handled separately in Stripe.")) return;
    setWorking(next);

    const res = await fetch(`/api/lead-gen/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    setWorking(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Failed to update the order", "error");
      return;
    }

    toast(next === "live" ? "Order is live." : "Order canceled.", "success");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status === "paid" && (
        <Button size="sm" variant="success" loading={working === "live"} onClick={() => update("live")}>
          <Rocket className="h-3.5 w-3.5" />
          Go live
        </Button>
      )}
      <Button size="sm" variant="ghost" loading={working === "canceled"} onClick={() => update("canceled")}>
        <X className="h-3.5 w-3.5" />
        Cancel
      </Button>
    </div>
  );
}

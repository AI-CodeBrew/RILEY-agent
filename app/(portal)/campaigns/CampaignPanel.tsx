"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Pause, Play, Radio } from "lucide-react";
import { Button, LinkButton } from "@/components/Button";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { formatPhone } from "@/lib/format";
import type { CampaignStatus, CustomerStatus } from "@/types/database";

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  status: CustomerStatus;
};

type CampaignMember = {
  id: string;
  status: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    status: CustomerStatus;
    last_call_summary: string | null;
    call_insights: Record<string, unknown> | null;
  } | null;
};

type Campaign = {
  id: string;
  status: CampaignStatus;
  window_start: string;
  window_end: string;
  gap_seconds: number;
  current_customer_id: string | null;
};

export function CampaignPanel({
  customers,
  initialCampaigns,
}: {
  customers: CustomerOption[];
  initialCampaigns: Campaign[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [working, setWorking] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(
    initialCampaigns.find((c) => c.status === "running" || c.status === "scheduled") ?? null
  );
  const [members, setMembers] = useState<CampaignMember[]>([]);

  const loadCampaign = useCallback(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setActiveCampaign(body.campaign);
      setMembers(body.members ?? []);
    }
  }, []);

  const tick = useCallback(async (id: string) => {
    await fetch(`/api/campaigns/${id}`, { method: "POST" });
    await loadCampaign(id);
  }, [loadCampaign]);

  useEffect(() => {
    const id = activeCampaign?.id;
    if (!id) return;

    let ignore = false;
    (async () => {
      const res = await fetch(`/api/campaigns/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!ignore && res.ok) {
        setActiveCampaign(body.campaign);
        setMembers(body.members ?? []);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [activeCampaign?.id]);

  useEffect(() => {
    if (!activeCampaign) return;
    if (!["running", "scheduled"].includes(activeCampaign.status)) return;

    const interval = setInterval(() => {
      void tick(activeCampaign.id);
      router.refresh();
    }, 15000);

    return () => clearInterval(interval);
  }, [activeCampaign, tick, router]);

  function toggleCustomer(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectByStatus(statuses: CustomerStatus[]) {
    setSelected(new Set(customers.filter((c) => statuses.includes(c.status)).map((c) => c.id)));
  }

  async function createAndStart() {
    if (selected.size === 0) {
      toast("Select at least one customer.", "error");
      return;
    }
    if (!windowStart || !windowEnd) {
      toast("Set a start and end time.", "error");
      return;
    }

    setWorking(true);
    const createRes = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        window_start: new Date(windowStart).toISOString(),
        window_end: new Date(windowEnd).toISOString(),
        customer_ids: [...selected],
        gap_seconds: 120,
      }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      setWorking(false);
      toast(created.error ?? "Could not create campaign.", "error");
      return;
    }

    const startRes = await fetch(`/api/campaigns/${created.campaign.id}/start`, { method: "POST" });
    const started = await startRes.json().catch(() => ({}));
    setWorking(false);

    if (!startRes.ok) {
      toast(started.error ?? "Campaign created but failed to start.", "error");
      return;
    }

    toast("Auto-dial started.", "success");
    setActiveCampaign(created.campaign);
    await loadCampaign(created.campaign.id);
    router.refresh();
  }

  async function stopCampaign() {
    if (!activeCampaign) return;
    setWorking(true);
    const res = await fetch(`/api/campaigns/${activeCampaign.id}/stop`, { method: "POST" });
    setWorking(false);
    if (!res.ok) {
      toast("Could not stop campaign.", "error");
      return;
    }
    toast("Auto-dial stopped.", "success");
    setActiveCampaign({ ...activeCampaign, status: "stopped" });
    router.refresh();
  }

  const pendingCount = members.filter((m) => m.status === "pending").length;
  const doneCount = members.filter((m) => m.status === "completed").length;

  return (
    <div className="space-y-6">
      {activeCampaign && ["running", "scheduled", "paused"].includes(activeCampaign.status) ? (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-accent animate-pulse" />
              <span className="font-medium">Auto-dial active</span>
              <StatusBadge status={activeCampaign.status} pulse={activeCampaign.status === "running"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {activeCampaign.id && (
                <LinkButton href={`/api/campaigns/${activeCampaign.id}/export`} variant="secondary" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </LinkButton>
              )}
              <Button variant="danger" size="sm" onClick={stopCampaign} loading={working}>
                <Pause className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted">
            {doneCount} completed · {pendingCount} remaining · calls spaced ~2 min apart
          </p>
          {members.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <span className="font-medium">{member.customer?.name}</span>
                    <span className="ml-2 text-muted">{formatPhone(member.customer?.phone ?? "")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={member.status} />
                    {member.customer?.status && (
                      <StatusBadge status={member.customer.status} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Start calling at"
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
            <Field
              label="Stop calling at"
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => selectByStatus(["new", "no_answer"])}>
              Select dial-ready
            </Button>
            <Button variant="secondary" size="sm" onClick={() => selectByStatus(["follow_up"])}>
              Select follow-up
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(customers.map((c) => c.id)))}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>

          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
            {customers.map((customer) => (
              <li key={customer.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background">
                  <input
                    type="checkbox"
                    checked={selected.has(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
                    className="rounded border-border"
                  />
                  <span className="flex-1 font-medium">{customer.name}</span>
                  <span className="text-sm text-muted">{formatPhone(customer.phone)}</span>
                  <StatusBadge status={customer.status} />
                </label>
              </li>
            ))}
          </ul>

          <Button onClick={createAndStart} loading={working} disabled={customers.length === 0}>
            <Play className="h-4 w-4" />
            Start auto-dial ({selected.size} selected)
          </Button>
        </>
      )}
    </div>
  );
}

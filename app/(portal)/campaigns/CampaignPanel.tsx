"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Pause, Play, Radio, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { formatPhone } from "@/lib/format";
import { regionForPhoneNumber, routingRegionLabel } from "@/lib/area-code-routing";
import { RETRY_DELAY_OPTIONS } from "@/lib/retry-delay";
import { CALL_TYPES, type CallType, type CampaignStatus, type CustomerStatus } from "@/types/database";

const CALL_TYPE_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

type ConnectedNumber = { id: string; phoneNumber: string };
type NumberRoute = { region: string; phone_number_id: string };

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  status: CustomerStatus;
  call_type: CallType | null;
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
  voice_gender: "male" | "female" | null;
};

export function CampaignPanel({
  customers,
  numbers,
  routes,
  initialCampaigns,
  defaultVoiceGender,
  agentId,
  retryDelayMinutes: initialRetryDelayMinutes,
  retryMaxAttempts: initialRetryMaxAttempts,
}: {
  customers: CustomerOption[];
  numbers: ConnectedNumber[];
  /** This agent's region → number routing — each call resolves its own number from this, never a manual pick. */
  routes: NumberRoute[];
  initialCampaigns: Campaign[];
  /** Set on the AI Integration page. Pre-fills the campaign voice pick; still changeable per campaign. */
  defaultVoiceGender: "male" | "female" | null;
  agentId: string;
  /** How long Abby waits before auto-redialing a follow_up/no_answer customer, and how many times before giving up — the agent's own settings, saved immediately here or on AI Integration. Retries fire inside *this* campaign's own Start/Stop window (below), not a separate setting. */
  retryDelayMinutes: number;
  retryMaxAttempts: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [callTypeFilter, setCallTypeFilter] = useState<CallType | "">("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [voiceGender, setVoiceGender] = useState<"male" | "female">(defaultVoiceGender ?? "female");
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(initialRetryDelayMinutes);
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(String(initialRetryMaxAttempts));
  const [savingRetryField, setSavingRetryField] = useState<"delay" | "attempts" | null>(null);
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

  function selectByCallType(callType: CallType | "") {
    setCallTypeFilter(callType);
    if (!callType) return;
    setSelected(new Set(customers.filter((c) => c.call_type === callType).map((c) => c.id)));
  }

  const numberById = new Map(numbers.map((n) => [n.id, n.phoneNumber]));
  const routeByRegion = new Map(routes.map((r) => [r.region, r.phone_number_id]));
  const hasDefaultRoute = routeByRegion.has("default");

  /** Which connected number a customer would be called from — mirrors lib/number-routing.ts. */
  function willCallFrom(phone: string): string | null {
    const region = regionForPhoneNumber(phone);
    const numberId = routeByRegion.get(region) ?? routeByRegion.get("default");
    const number = numberId ? numberById.get(numberId) : null;
    return number ? `${formatPhone(number)} (${routingRegionLabel(region)})` : null;
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
        voice_gender: voiceGender,
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

  async function saveRetryDelay(minutes: number) {
    setSavingRetryField("delay");
    setRetryDelayMinutes(minutes);

    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retry_delay_minutes: minutes }),
    });

    setSavingRetryField(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save.", "error");
      return;
    }

    toast("Saved.", "success");
    router.refresh();
  }

  async function saveRetryMaxAttempts() {
    const attempts = Number(retryMaxAttempts);
    if (!Number.isFinite(attempts) || attempts < 0) {
      setRetryMaxAttempts(String(initialRetryMaxAttempts));
      return;
    }

    setSavingRetryField("attempts");

    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retry_max_attempts: attempts }),
    });

    setSavingRetryField(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not save.", "error");
      return;
    }

    toast("Saved.", "success");
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
            {doneCount} completed · {pendingCount} remaining · calls spaced ~2 min apart ·{" "}
            {activeCampaign.voice_gender ?? "default"} voice
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Each customer is called from the number routed to their area code
              in{" "}
              <a href="/settings" className="text-accent hover:underline">
                Settings → Number routing
              </a>
              .
            </p>

            <Button
              onClick={createAndStart}
              loading={working}
              disabled={customers.length === 0}
            >
              <Play className="h-4 w-4" />
              Start auto-dial ({selected.size} selected)
            </Button>
          </div>

          {!hasDefaultRoute && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              No Default number routed — customers outside the 7 mapped
              regions will fail to dial until you set one.
            </p>
          )}

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
            <SelectField
              label="Voice"
              value={voiceGender}
              onChange={(e) => setVoiceGender(e.target.value as "male" | "female")}
              hint="Used for every call this campaign places."
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </SelectField>
            <SelectField
              label="Redial follow-up / no-answer after"
              value={retryDelayMinutes}
              disabled={savingRetryField === "delay"}
              onChange={(e) => saveRetryDelay(Number(e.target.value))}
              hint="Saves immediately, applies to every campaign you run. Fires inside this campaign's own Start/Stop window above, resuming the same time tomorrow if it closes first."
            >
              {RETRY_DELAY_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <Field
              label="Max auto-retry attempts"
              type="number"
              min={0}
              value={retryMaxAttempts}
              disabled={savingRetryField === "attempts"}
              onChange={(e) => setRetryMaxAttempts(e.target.value)}
              onBlur={saveRetryMaxAttempts}
              hint="Stops auto-redialing after this many tries and leaves the lead for you to call manually."
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label="Call type"
              value={callTypeFilter}
              onChange={(e) => selectByCallType(e.target.value as CallType | "")}
              hint="Selects every dial-ready customer with this call type."
            >
              <option value="">Select by call type…</option>
              {CALL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CALL_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCallTypeFilter("");
                selectByStatus(["new", "no_answer"]);
              }}
            >
              Select dial-ready
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCallTypeFilter("");
                selectByStatus(["follow_up"]);
              }}
            >
              Select follow-up
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCallTypeFilter("");
                setSelected(new Set(customers.map((c) => c.id)));
              }}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCallTypeFilter("");
                setSelected(new Set());
              }}
            >
              Clear
            </Button>
          </div>

          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
            {customers.map((customer) => {
              const dialFrom = willCallFrom(customer.phone);
              return (
              <li key={customer.id}>
                <label
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background"
                  title={dialFrom ? `Will call from ${dialFrom}` : "No number routed for this area code"}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
                    className="rounded border-border"
                  />
                  <span className="flex-1 font-medium">{customer.name}</span>
                  <span className="text-sm text-muted">{formatPhone(customer.phone)}</span>
                  {!dialFrom && (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  )}
                  {customer.call_type && <StatusBadge status={customer.call_type} />}
                  <StatusBadge status={customer.status} />
                </label>
              </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

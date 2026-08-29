"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Pause, Play, Plus, Radio, Trash2, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { CALL_TYPES, type CallType, type CampaignStatus, type CustomerStatus } from "@/types/database";

const CALL_TYPE_LABELS: Record<CallType, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

type CustomerOption = {
  id: string;
  name: string;
  status: CustomerStatus;
  call_type: CallType | null;
  /** Precomputed server-side from the customer's phone — agents never receive the raw number itself (see lib/customer-visibility.ts). */
  dialFrom: string | null;
};

type CampaignMember = {
  id: string;
  status: string;
  window_id: string | null;
  customer: {
    id: string;
    name: string;
    status: CustomerStatus;
    last_call_summary: string | null;
    call_insights: Record<string, unknown> | null;
  } | null;
};

type CampaignWindow = { id?: string; start_time: string; end_time: string; call_type: CallType | null };

/**
 * One schedule in the creation form — its own Start/Stop pickers, its own
 * call type override, and (crucially) its own customer selection. A
 * campaign can have several of these (e.g. one 8-11am schedule dialing one
 * list, another 4-8pm schedule dialing a different list); each only ever
 * dials the customers picked for *that* row, and only during that row's
 * window. The date/time pickers are plain browser-local values — no
 * timezone math here — and the whole campaign's actual IANA zone is
 * captured once at submit time (see submittedTimezone below) so the dial
 * engine checks windows against the same clock the agent used to set them.
 */
type ScheduleEntry = { start: string; end: string; callType: CallType | ""; selected: Set<string> };

type Campaign = {
  id: string;
  status: CampaignStatus;
  start_date: string;
  end_date: string;
  windows: CampaignWindow[];
  gap_seconds: number;
  current_customer_id: string | null;
  voice_gender: "male" | "female" | null;
};

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "YYYY-MM-DDTHH:MM" for `date`, read straight off the browser's own local
 * clock (Date's local getters) — this is exactly what a datetime-local
 * input already shows the agent, so no timezone conversion happens here at
 * all. Whatever the agent sees and picks is what gets submitted. */
function datetimeLocalNow(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newSchedule(start = "", end = ""): ScheduleEntry {
  return { start, end, callType: "", selected: new Set() };
}

export function CampaignPanel({
  customers,
  hasDefaultRoute,
  initialCampaigns,
  defaultVoiceGender,
  callGapSeconds,
}: {
  customers: CustomerOption[];
  /** Whether this agent has a Default number routed — see Settings → Number routing. */
  hasDefaultRoute: boolean;
  initialCampaigns: Campaign[];
  /** Set on the AI Integration page — the only place the bot's voice is picked. Every auto-dial campaign just uses this; there's no separate per-campaign override. */
  defaultVoiceGender: "male" | "female" | null;
  /** Delay Between Calls, from Auto-Dial Settings — the default gap for a new campaign. */
  callGapSeconds: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([newSchedule()]);
  const [working, setWorking] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(
    initialCampaigns.find((c) => c.status === "running" || c.status === "scheduled") ?? null
  );
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [advanceStatus, setAdvanceStatus] = useState<string | null>(null);

  // Computed client-side only (not during SSR) to avoid a hydration mismatch
  // on a value that changes every render — this is purely an informational
  // hint next to the pickers below, not used for any actual scheduling math.
  const [nowLabel, setNowLabel] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setNowLabel(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Default the very first schedule to "right now through the next 4 hours,"
  // read straight off the browser's own clock — so pressing Start auto-dial
  // without touching the pickers just starts calling immediately. Runs once
  // on mount only, so it never clobbers a schedule the agent has already
  // started editing.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSchedules([newSchedule(datetimeLocalNow(), datetimeLocalNow(4 * 60 * 60 * 1000))]);
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const loadCampaign = useCallback(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setActiveCampaign(body.campaign);
      setMembers(body.members ?? []);
    }
  }, []);

  const tick = useCallback(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.action && body.action !== "dialed") {
      setAdvanceStatus(body.message ?? body.action);
    } else if (res.ok) {
      setAdvanceStatus(null);
    }
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

    // Tick once right away (deferred out of the effect body itself, per
    // react-hooks/set-state-in-effect) so the "why nothing's happening yet"
    // status below shows immediately rather than waiting out the first
    // interval.
    const immediate = setTimeout(() => void tick(activeCampaign.id), 0);

    const interval = setInterval(() => {
      void tick(activeCampaign.id);
      router.refresh();
    }, 15000);

    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id, activeCampaign?.status]);

  function updateSchedule(index: number, patch: Partial<Omit<ScheduleEntry, "selected">>) {
    setSchedules((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function toggleCustomer(index: number, customerId: string) {
    setSchedules((current) =>
      current.map((s, i) => {
        if (i !== index) return s;
        const next = new Set(s.selected);
        if (next.has(customerId)) next.delete(customerId);
        else next.add(customerId);
        return { ...s, selected: next };
      })
    );
  }

  function selectByStatus(index: number, statuses: CustomerStatus[]) {
    setSchedules((current) =>
      current.map((s, i) =>
        i === index ? { ...s, selected: new Set(customers.filter((c) => statuses.includes(c.status)).map((c) => c.id)) } : s
      )
    );
  }

  function selectByCallType(index: number, callType: CallType) {
    setSchedules((current) =>
      current.map((s, i) =>
        i === index
          ? { ...s, callType, selected: new Set(customers.filter((c) => c.call_type === callType).map((c) => c.id)) }
          : s
      )
    );
  }

  function selectAll(index: number) {
    setSchedules((current) =>
      current.map((s, i) => (i === index ? { ...s, selected: new Set(customers.map((c) => c.id)) } : s))
    );
  }

  function clearSelection(index: number) {
    setSchedules((current) => current.map((s, i) => (i === index ? { ...s, selected: new Set() } : s)));
  }

  function addSchedule() {
    setSchedules((current) => [...current, newSchedule()]);
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, i) => i !== index));
  }

  async function createAndStart() {
    const validSchedules = schedules.filter((s) => s.start && s.end);
    if (validSchedules.length === 0) {
      toast("Set a start and end time for at least one schedule.", "error");
      return;
    }
    for (const s of validSchedules) {
      if (s.end <= s.start) {
        toast("Stop calling at must be after Start calling at.", "error");
        return;
      }
      if (s.selected.size === 0) {
        toast("Select at least one customer for every schedule.", "error");
        return;
      }
    }

    // Each schedule's date/time picker gives a full "YYYY-MM-DDTHH:MM" value —
    // the overall campaign date range is the earliest start date and latest
    // end date across every schedule; only the time-of-day from each becomes
    // one recurring daily window (see lib/campaign-schedule.ts). The browser's
    // own IANA zone is captured once here so the dial engine checks these
    // windows against the exact clock the agent used to set them.
    const startDate = validSchedules.map((s) => s.start.slice(0, 10)).sort()[0];
    const endDate = validSchedules.map((s) => s.end.slice(0, 10)).sort().at(-1)!;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const windows = validSchedules.map((s) => ({
      start_time: s.start.slice(11, 16),
      end_time: s.end.slice(11, 16),
      call_type: s.callType || null,
      customer_ids: [...s.selected],
    }));

    setWorking(true);
    const createRes = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        timezone,
        windows,
        gap_seconds: callGapSeconds,
        voice_gender: defaultVoiceGender,
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
            {formatDate(activeCampaign.start_date)} – {formatDate(activeCampaign.end_date)} ·{" "}
            {doneCount} completed · {pendingCount} remaining · calls spaced ~{activeCampaign.gap_seconds}s apart ·{" "}
            {activeCampaign.voice_gender ?? "default"} voice
          </p>
          {advanceStatus && pendingCount > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Not dialing right now: {advanceStatus}
            </p>
          )}
          {activeCampaign.windows.map((window) => {
            const windowMembers = members.filter((m) => m.window_id === window.id);
            if (windowMembers.length === 0) return null;
            return (
              <div key={window.id} className="space-y-1.5">
                <p className="text-xs font-medium text-muted">
                  {formatTime(window.start_time)}–{formatTime(window.end_time)}
                  {window.call_type && <> · {CALL_TYPE_LABELS[window.call_type]}</>}
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                  {windowMembers.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="font-medium">{member.customer?.name}</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={member.status} />
                        {member.customer?.status && <StatusBadge status={member.customer.status} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
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
              Start auto-dial
            </Button>
          </div>

          {!hasDefaultRoute && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              No Default number routed — customers outside the 7 mapped
              regions will fail to dial until you set one.
            </p>
          )}

          <p className="rounded-lg bg-accent-soft/30 px-3 py-2 text-xs text-muted">
            Times below are your own computer&apos;s clock. The first schedule already defaults to
            right now through the next 4 hours, so pressing Start auto-dial as-is begins calling
            immediately.
            {nowLabel && <> It&apos;s currently <strong>{nowLabel}</strong> on this computer.</>}
          </p>
          <p className="text-xs font-medium text-muted">
            Each schedule has its own customer list and call type — add a second schedule if you
            want two different times of day to dial two different lists (e.g. one 8-11am group,
            another 4-8pm group). Calls for a schedule&apos;s customers only go out during that
            schedule&apos;s window.
          </p>

          <div className="space-y-4">
            {schedules.map((schedule, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Start calling at"
                    type="datetime-local"
                    value={schedule.start}
                    onChange={(e) => updateSchedule(index, { start: e.target.value })}
                  />
                  <div className="flex items-end gap-2">
                    <Field
                      label="Stop calling at"
                      type="datetime-local"
                      value={schedule.end}
                      onChange={(e) => updateSchedule(index, { end: e.target.value })}
                      className="flex-1"
                    />
                    {schedules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSchedule(index)}
                        aria-label="Remove schedule"
                        className="rounded-md p-2 text-muted transition-colors hover:bg-surface hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <SelectField
                  label="Call type for this schedule"
                  value={schedule.callType}
                  onChange={(e) => {
                    const value = e.target.value as CallType | "";
                    if (value) selectByCallType(index, value);
                    else updateSchedule(index, { callType: "" });
                  }}
                  hint="Picking a type below also selects every customer with that call type — deselect any you don't want to include."
                  className="sm:max-w-xs"
                >
                  <option value="">Use customer&apos;s own type</option>
                  {CALL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CALL_TYPE_LABELS[type]}
                    </option>
                  ))}
                </SelectField>

                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => selectByStatus(index, ["new", "no_answer"])}>
                    Select dial-ready
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => selectByStatus(index, ["follow_up"])}>
                    Select follow-up
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => selectAll(index)}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => clearSelection(index)}>
                    Clear
                  </Button>
                  <span className="text-xs text-muted">{schedule.selected.size} selected</span>
                </div>

                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
                  {customers.map((customer) => (
                    <li key={customer.id}>
                      <label
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background"
                        title={
                          customer.dialFrom
                            ? `Will call from ${customer.dialFrom}`
                            : "No number routed for this area code"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={schedule.selected.has(customer.id)}
                          onChange={() => toggleCustomer(index, customer.id)}
                          className="rounded border-border"
                        />
                        <span className="flex-1 font-medium">{customer.name}</span>
                        {!customer.dialFrom && (
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        {customer.call_type && <StatusBadge status={customer.call_type} />}
                        <StatusBadge status={customer.status} />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addSchedule}>
              <Plus className="h-3.5 w-3.5" />
              Add another schedule
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

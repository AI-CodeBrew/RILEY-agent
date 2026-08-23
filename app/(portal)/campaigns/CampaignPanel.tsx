"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Pause, Play, Plus, Radio, Trash2, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/lib/status-badge";
import { canadaTimezoneLabel } from "@/lib/canada-timezones";
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
  customer: {
    id: string;
    name: string;
    status: CustomerStatus;
    last_call_summary: string | null;
    call_insights: Record<string, unknown> | null;
  } | null;
};

type CampaignWindow = { id?: string; start_time: string; end_time: string };

/** One "Start calling at / Stop calling at" pair in the creation form — a
 * familiar datetime-local picker (calendar + time in one control), same as
 * the original single-window campaign UI. Multiple rows let an agent set up
 * more than one daily window (e.g. one at 8-11am, another at 4-8pm); the
 * overall campaign date range is derived from the earliest start date and
 * latest end date across every row, and only the time-of-day from each
 * pair becomes one recurring daily window. */
type ScheduleEntry = { start: string; end: string };

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

/** "YYYY-MM-DDTHH:MM" for `date` as read in `timeZone` — the datetime-local
 * input's own value format, but computed from the *agent's* timezone rather
 * than whatever zone the browser/OS happens to be in, so a freshly-opened
 * form defaults to "right now" in the zone the dialer engine actually
 * checks against (see lib/campaign-schedule.ts) instead of the agent having
 * to convert it by hand. */
function datetimeLocalInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function CampaignPanel({
  customers,
  hasDefaultRoute,
  initialCampaigns,
  defaultVoiceGender,
  callGapSeconds,
  agentTimezone,
}: {
  customers: CustomerOption[];
  /** Whether this agent has a Default number routed — see Settings → Number routing. */
  hasDefaultRoute: boolean;
  initialCampaigns: Campaign[];
  /** Set on the AI Integration page. Pre-fills the campaign voice pick; still changeable per campaign. */
  defaultVoiceGender: "male" | "female" | null;
  /** Delay Between Calls, from Auto-Dial Settings — the default gap for a new campaign. */
  callGapSeconds: number;
  /** sales_agents.timezone — the Start/Stop calling at pickers below are interpreted in this zone, not the browser's own clock, since that's what the dialer engine (lib/campaign-schedule.ts) compares against. */
  agentTimezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [callTypeFilter, setCallTypeFilter] = useState<CallType | "">("");
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([{ start: "", end: "" }]);
  const [voiceGender, setVoiceGender] = useState<"male" | "female">(defaultVoiceGender ?? "female");
  const [working, setWorking] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(
    initialCampaigns.find((c) => c.status === "running" || c.status === "scheduled") ?? null
  );
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [advanceStatus, setAdvanceStatus] = useState<string | null>(null);

  // Computed client-side only (not during SSR) to avoid a hydration mismatch
  // on a value that changes every render — this is purely an informational
  // hint next to the pickers below, not used for any actual scheduling math.
  const [nowInAgentZone, setNowInAgentZone] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setNowInAgentZone(
        new Intl.DateTimeFormat("en-US", {
          timeZone: agentTimezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date())
      );
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [agentTimezone]);

  // Default the very first schedule to "right now through the next 4 hours,"
  // computed in the agent's own timezone — so pressing Start auto-dial
  // without touching the pickers just starts calling immediately, instead
  // of requiring the agent to manually convert their local clock into the
  // account's configured business timezone (see datetimeLocalInZone above).
  // Runs once on mount only, so it never clobbers a schedule the agent has
  // already started editing.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const now = new Date();
      const inFourHours = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      setSchedules([
        {
          start: datetimeLocalInZone(now, agentTimezone),
          end: datetimeLocalInZone(inFourHours, agentTimezone),
        },
      ]);
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function addSchedule() {
    setSchedules((current) => [...current, { start: "", end: "" }]);
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, i) => i !== index));
  }

  function updateSchedule(index: number, field: "start" | "end", value: string) {
    setSchedules((current) => current.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  async function createAndStart() {
    if (selected.size === 0) {
      toast("Select at least one customer.", "error");
      return;
    }

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
    }

    // Each schedule's date/time picker gives a full "YYYY-MM-DDTHH:MM" value —
    // the overall campaign date range is the earliest start date and latest
    // end date across every schedule; only the time-of-day from each becomes
    // one recurring daily window (see lib/campaign-schedule.ts).
    const startDate = validSchedules.map((s) => s.start.slice(0, 10)).sort()[0];
    const endDate = validSchedules.map((s) => s.end.slice(0, 10)).sort().at(-1)!;
    const windows = validSchedules.map((s) => ({
      start_time: s.start.slice(11, 16),
      end_time: s.end.slice(11, 16),
    }));

    setWorking(true);
    const createRes = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        windows,
        customer_ids: [...selected],
        gap_seconds: callGapSeconds,
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
            {activeCampaign.windows.map((w) => `${formatTime(w.start_time)}–${formatTime(w.end_time)}`).join(", ")}
          </p>
          <p className="text-sm text-muted">
            {doneCount} completed · {pendingCount} remaining · calls spaced ~{activeCampaign.gap_seconds}s apart ·{" "}
            {activeCampaign.voice_gender ?? "default"} voice
          </p>
          {advanceStatus && pendingCount > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Not dialing right now: {advanceStatus}
            </p>
          )}
          {members.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <span className="font-medium">{member.customer?.name}</span>
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

          <SelectField
            label="Voice"
            value={voiceGender}
            onChange={(e) => setVoiceGender(e.target.value as "male" | "female")}
            hint="Used for every call this campaign places."
            className="sm:max-w-xs"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </SelectField>

          <div className="space-y-2">
            <p className="rounded-lg bg-accent-soft/30 px-3 py-2 text-xs text-muted">
              Times below are in your account&apos;s timezone ({canadaTimezoneLabel(agentTimezone)}) —
              not necessarily your computer&apos;s own clock. The first schedule already defaults to
              right now through the next 4 hours, so pressing Start auto-dial as-is begins calling
              immediately.
              {nowInAgentZone && <> It&apos;s currently <strong>{nowInAgentZone}</strong> there.</>}
            </p>
            <p className="text-xs font-medium text-muted">
              Add a second schedule if you want to call at two different times a day (e.g. one
              8-11am, another 4-8pm) — dates run from the earliest Start calling at to the latest
              Stop calling at across every schedule below. If one schedule&apos;s time runs out
              with customers still undialed, the rest pick back up automatically at the next one.
            </p>
            {schedules.map((schedule, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
                <Field
                  label="Start calling at"
                  type="datetime-local"
                  value={schedule.start}
                  onChange={(e) => updateSchedule(index, "start", e.target.value)}
                />
                <div className="flex items-end gap-2">
                  <Field
                    label="Stop calling at"
                    type="datetime-local"
                    value={schedule.end}
                    onChange={(e) => updateSchedule(index, "end", e.target.value)}
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
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addSchedule}>
              <Plus className="h-3.5 w-3.5" />
              Add another schedule
            </Button>
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
                    checked={selected.has(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
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
        </>
      )}
    </div>
  );
}

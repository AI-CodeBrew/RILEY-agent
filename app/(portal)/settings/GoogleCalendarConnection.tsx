"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleDashed, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";

interface GoogleCalendarOption {
  id: string;
  name: string;
  primary: boolean;
  writable: boolean;
}

const AVAILABILITY_CALENDAR_NAME = "Riley Availability";

/**
 * Connects the agent's Google Calendar and sets up the two things Riley
 * needs from it: the calendar whose events mark when they're free, and the
 * calendars whose events count as busy. "Connect" is a real top-level
 * navigation to /api/oauth/google-calendar/start (OAuth needs the browser to
 * go to Google), same as Google Meet's connect button.
 */
export function GoogleCalendarConnection({
  agent,
}: {
  agent: {
    id: string;
    connected: boolean;
    accountEmail: string | null;
    availabilityCalendarId: string | null;
    busyCalendarIds: string[];
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const handledResult = useRef(false);

  const [calendars, setCalendars] = useState<GoogleCalendarOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availabilityId, setAvailabilityId] = useState(agent.availabilityCalendarId ?? "");
  const [busyIds, setBusyIds] = useState<string[]>(agent.busyCalendarIds);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const result = searchParams.get("google_calendar");
    if (!result || handledResult.current) return;
    handledResult.current = true;

    if (result === "connected") {
      toast("Google Calendar connected. Now pick your availability calendar below.", "success");
    } else if (result === "error") {
      const detail = searchParams.get("google_calendar_detail");
      toast(
        detail
          ? `Could not connect Google Calendar: ${detail}`
          : "Could not connect Google Calendar. Please try again.",
        "error"
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("google_calendar");
    url.searchParams.delete("google_calendar_detail");
    router.replace(`${url.pathname}${url.search}`);
    // Only run once, when the redirect param first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!agent.connected) return;
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/google-calendar/calendars");
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(body.error ?? "Could not load your Google calendars.");
        return;
      }
      const list = body.calendars as GoogleCalendarOption[];
      setCalendars(list);
      // "primary" is how a fresh connection stores the main calendar — show
      // it as the real calendar so its checkbox lines up.
      const primary = list.find((calendar) => calendar.primary);
      if (primary) {
        setBusyIds((ids) => ids.map((id) => (id === "primary" ? primary.id : id)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agent.connected]);

  function chooseAvailability(id: string) {
    setAvailabilityId(id);
    // Its own "Available" blocks must never count as busy.
    setBusyIds((ids) => ids.filter((busyId) => busyId !== id));
  }

  function toggleBusy(id: string) {
    setBusyIds((ids) => (ids.includes(id) ? ids.filter((busyId) => busyId !== id) : [...ids, id]));
  }

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/google-calendar/calendars", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setCreating(false);

    if (!res.ok) {
      toast(body.error ?? "Could not create the calendar.", "error");
      return;
    }

    const created = body.calendar as { id: string; name: string };
    setCalendars((list) => [
      ...(list ?? []),
      { id: created.id, name: created.name, primary: false, writable: true },
    ]);
    chooseAvailability(created.id);
    toast(`"${created.name}" created in your Google Calendar and set as your availability calendar.`, "success");
    router.refresh();
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/google-calendar/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availability_calendar_id: availabilityId || null,
        busy_calendar_ids: busyIds,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast(body.error ?? "Could not save your Google Calendar settings.", "error");
      return;
    }

    toast("Google Calendar settings saved.", "success");
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await fetch(`/api/agents/${agent.id}/google-calendar`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDisconnecting(false);

    if (!res.ok) {
      toast(body.error ?? "Could not disconnect Google Calendar.", "error");
      return;
    }

    toast("Google Calendar disconnected.", "success");
    router.refresh();
  }

  if (!agent.connected) {
    return (
      <div className="space-y-3">
        <StatusPill connected={false} />
        <p className="text-xs text-muted">
          Riley reads when you&apos;re free straight from your Google Calendar,
          skips anything you&apos;re already busy with, and puts every booking
          on your calendar with a Google Meet link. Google emails the customer
          the invite.
        </p>
        {/* Plain <a>, not next/link — this must be a real full-page
            navigation so the browser (not the client router) follows the
            redirect to Google's consent screen. */}
        <a
          href="/api/oauth/google-calendar/start"
          className="inline-flex w-fit items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          Connect Google Calendar
        </a>
      </div>
    );
  }

  const hasRileyCalendar = calendars?.some((calendar) => calendar.name === AVAILABILITY_CALENDAR_NAME);
  const conflictOptions = (calendars ?? []).filter((calendar) => calendar.id !== availabilityId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill connected />
          <span className="text-sm">{agent.accountEmail ?? "Google account"}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect} loading={disconnecting}>
          Disconnect
        </Button>
      </div>

      {loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : !calendars ? (
        <p className="text-sm text-muted">Loading your calendars…</p>
      ) : (
        <>
          <div className="space-y-2">
            <SelectField
              label="1. Availability calendar — the times you're free"
              name="availability_calendar"
              value={availabilityId}
              onChange={(event) => chooseAvailability(event.target.value)}
              hint="Each event on this calendar is a block of time Riley may book. Leave it unset to use your weekly hours from Calendar → Availability instead."
            >
              <option value="">Not set — use my weekly hours</option>
              {calendars
                .filter((calendar) => calendar.writable && !calendar.primary)
                .map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
            </SelectField>
            {!hasRileyCalendar && (
              <Button variant="secondary" size="sm" onClick={handleCreate} loading={creating}>
                <Plus className="h-3.5 w-3.5" />
                Create a &ldquo;{AVAILABILITY_CALENDAR_NAME}&rdquo; calendar for me
              </Button>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted">
              2. Conflict calendars — Riley never books over events on these
            </legend>
            <div className="space-y-1.5">
              {conflictOptions.map((calendar) => (
                <label key={calendar.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={busyIds.includes(calendar.id)}
                    onChange={() => toggleBusy(calendar.id)}
                    className="rounded border-border"
                  />
                  <span>{calendar.name}</span>
                  {calendar.primary && <span className="text-xs text-muted">(main calendar)</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <Button onClick={handleSave} loading={saving}>
            Save Google Calendar settings
          </Button>

          <div className="rounded-lg bg-background p-4 text-xs text-muted">
            <p className="mb-2 font-medium text-foreground">How to mark your free time</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                In Google Calendar, create an event on your availability calendar
                — e.g. &ldquo;Available&rdquo;, Monday 10:00 AM – 1:00 PM.
              </li>
              <li>Set it to repeat (e.g. every weekday). Add more blocks for other hours.</li>
              <li>
                That&apos;s it. Riley offers only times inside those blocks that
                don&apos;t clash with your conflict calendars. Delete a day&apos;s
                block to take that day off.
              </li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
      <CircleDashed className="h-3.5 w-3.5" />
      Not connected
    </span>
  );
}

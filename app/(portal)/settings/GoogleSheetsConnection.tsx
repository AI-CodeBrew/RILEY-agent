"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleDashed, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/Field";
import { useToast } from "@/components/Toast";

declare global {
  interface Window {
    gapi?: { load: (api: string, callback: () => void) => void };
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        ViewId: { SPREADSHEETS: string };
        Action: { PICKED: string };
        DocsView: new (viewId: string) => { setMimeTypes: (mimeTypes: string) => unknown };
      };
    };
  }
}

interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (cb: (data: PickerResponse) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface PickerResponse {
  action: string;
  docs?: { id: string; name: string }[];
}

const PICKER_SCRIPT_SRC = "https://apis.google.com/js/api.js";

type ConnectionState = "not_connected" | "pending" | "connected" | "disconnected";

export interface GoogleSheetsAgentInfo {
  id: string;
  state: ConnectionState;
  accountEmail: string | null;
  spreadsheetName: string | null;
  nameColumn: string | null;
  phoneColumn: string | null;
  emailColumn: string | null;
  lastSyncedAt: string | null;
}

/**
 * Lets an agent connect the Google Sheet their lead-gen ads deliver new rows
 * into — process-sheet-leads (app/api/cron) then auto-imports new rows as
 * customers and calls them. Same OAuth-redirect pattern as
 * GoogleMeetConnection, plus the Google Picker widget for choosing a sheet
 * and a small column-mapping form once one's chosen.
 */
export function GoogleSheetsConnection({ agent }: { agent: GoogleSheetsAgentInfo }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const handledResult = useRef(false);

  const [disconnecting, setDisconnecting] = useState(false);
  const [openingPicker, setOpeningPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Set once a sheet's been picked this session — drives showing the
  // mapping form instead of re-deriving it from `agent` (which only
  // reflects a *saved* mapping, from before this page load).
  const [mapping, setMapping] = useState<{ spreadsheetName: string; headers: string[] } | null>(null);
  const [nameColumn, setNameColumn] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [emailColumn, setEmailColumn] = useState("");

  useEffect(() => {
    const result = searchParams.get("google_sheets");
    if (!result || handledResult.current) return;
    handledResult.current = true;

    if (result === "connected") {
      toast("Google account connected.", "success");
    } else if (result === "error") {
      const detail = searchParams.get("google_sheets_detail");
      toast(
        detail ? `Could not connect your Google account: ${detail}` : "Could not connect your Google account.",
        "error"
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("google_sheets");
    url.searchParams.delete("google_sheets_detail");
    router.replace(`${url.pathname}${url.search}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function loadPickerScript(): Promise<void> {
    if (window.gapi) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${PICKER_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        return;
      }
      const script = document.createElement("script");
      script.src = PICKER_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google's Picker script."));
      document.head.appendChild(script);
    });
  }

  async function openPicker() {
    setOpeningPicker(true);
    try {
      const res = await fetch("/api/google-sheets/picker-token");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not open the sheet picker.");
      const { accessToken, apiKey } = body as { accessToken: string; apiKey: string };

      await loadPickerScript();
      await new Promise<void>((resolve) => window.gapi!.load("picker", () => resolve()));

      const google = window.google!;
      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback(async (data: PickerResponse) => {
          if (data.action !== google.picker.Action.PICKED) return;
          const doc = data.docs?.[0];
          if (!doc) return;
          await selectSheet(doc.id);
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open the sheet picker.", "error");
    } finally {
      setOpeningPicker(false);
    }
  }

  async function selectSheet(spreadsheetId: string) {
    const res = await fetch("/api/google-sheets/select-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body.error ?? "Could not read that sheet.", "error");
      return;
    }
    setMapping({ spreadsheetName: body.spreadsheetName, headers: body.headers });
    setNameColumn("");
    setPhoneColumn("");
    setEmailColumn("");
  }

  async function saveMapping() {
    if (!nameColumn || !phoneColumn) {
      toast("Pick which column is Name and which is Phone.", "error");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/google-sheets/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameColumn,
        phoneColumn,
        emailColumn: emailColumn || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast(body.error ?? "Could not save the column mapping.", "error");
      return;
    }
    toast("Lead import connected.", "success");
    setMapping(null);
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await fetch(`/api/agents/${agent.id}/google-sheets`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDisconnecting(false);
    if (!res.ok) {
      toast(body.error ?? "Could not disconnect.", "error");
      return;
    }
    toast("Lead import disconnected.", "success");
    router.refresh();
  }

  // A sheet was just picked this session — show the mapping form regardless
  // of what `agent` (last server render) says.
  if (mapping) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Sheet: <span className="font-medium">{mapping.spreadsheetName}</span>
        </p>
        <p className="text-xs text-muted">Match the columns — Email is optional.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Name" value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
            <option value="">Select column</option>
            {mapping.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </SelectField>
          <SelectField label="Phone" value={phoneColumn} onChange={(e) => setPhoneColumn(e.target.value)}>
            <option value="">Select column</option>
            {mapping.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </SelectField>
          <SelectField label="Email (optional)" value={emailColumn} onChange={(e) => setEmailColumn(e.target.value)}>
            <option value="">None</option>
            {mapping.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveMapping} loading={saving}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => setMapping(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (agent.state === "connected") {
    return (
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected
        </span>
        <p className="flex items-center gap-1.5 text-sm">
          <FileSpreadsheet className="h-3.5 w-3.5 text-muted" />
          {agent.spreadsheetName}
        </p>
        <p className="text-xs text-muted">
          {agent.accountEmail}
          {agent.lastSyncedAt && (
            <> · last synced {new Date(agent.lastSyncedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={openPicker} loading={openingPicker}>
            Change sheet
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDisconnect} loading={disconnecting}>
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  if (agent.state === "pending") {
    // OAuth done, sheet not chosen yet.
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">Google account connected ({agent.accountEmail}) — pick your leads sheet to finish.</p>
        <Button onClick={openPicker} loading={openingPicker}>
          Choose sheet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
          <CircleDashed className="h-3.5 w-3.5" />
          {agent.state === "disconnected" ? "Disconnected" : "Not connected"}
        </span>
      </div>
      <p className="text-xs text-muted">
        Connect the Google Sheet your lead-gen ads (Meta Lead Ads, etc.) deliver new leads into — new rows are
        imported as customers and called automatically, within about 15 seconds.
      </p>
      <a
        href="/api/oauth/google-sheets/start"
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        {agent.state === "disconnected" ? "Reconnect Google Sheets" : "Connect Google Sheets"}
      </a>
    </div>
  );
}

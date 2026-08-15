"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, History, Mars, ScrollText, Trash2, Venus, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { AgentAiPreferenceChange } from "@/types/database";

const SCRIPT_LABELS: Record<string, string> = {
  POS: "POS",
  UNION: "Union",
  WILL_KIT: "Will Kit",
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function changeLabel(change: AgentAiPreferenceChange) {
  if (change.field === "voice_gender") {
    const from = change.old_value ? capitalize(change.old_value) : "no default";
    const to = change.new_value ? capitalize(change.new_value) : "no default";
    return { title: "Voice changed", detail: `${from} → ${to}` };
  }
  if (change.field === "bot_name") {
    const from = change.old_value ?? "no default";
    const to = change.new_value ?? "no default";
    return { title: "Bot name changed", detail: `${from} → ${to}` };
  }
  const from = change.old_value ? (SCRIPT_LABELS[change.old_value] ?? change.old_value) : "no default";
  const to = change.new_value ? (SCRIPT_LABELS[change.new_value] ?? change.new_value) : "no default";
  return { title: "Script changed", detail: `${from} → ${to}` };
}

export function AIIntegrationHistory({
  agentId,
  timezone,
  initialHistory,
}: {
  agentId: string;
  timezone: string;
  initialHistory: AgentAiPreferenceChange[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [history, setHistory] = useState(initialHistory);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState<"all" | "selected" | null>(null);
  const [clearing, setClearing] = useState(false);

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleClear(scope: "all" | "selected") {
    setClearing(true);

    const res = await fetch(`/api/agents/${agentId}/ai-history`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scope === "selected" ? { ids: [...selectedIds] } : {}),
    });

    setClearing(false);
    setConfirming(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "Could not clear history.", "error");
      return;
    }

    if (scope === "all") {
      setHistory([]);
    } else {
      setHistory((current) => current.filter((c) => !selectedIds.has(c.id)));
    }
    exitSelectionMode();
    toast(scope === "all" ? "History cleared." : "Selected entries cleared.", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-accent" />
          Recent changes
        </h2>

        {history.length > 0 && (
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <>
                <span className="text-xs text-muted">{selectedIds.size} selected</span>
                <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={selectedIds.size === 0}
                  onClick={() => setConfirming("selected")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear selected
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setSelectionMode(true)}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  Select
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming("all")}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No changes yet"
          description="Every voice or script change you make shows up here."
        />
      ) : (
        <ul className="space-y-3">
          {history.map((change) => {
            const { title, detail } = changeLabel(change);
            const Icon = change.field === "voice_gender" ? (change.new_value === "male" ? Mars : Venus) : ScrollText;
            const isSelected = selectedIds.has(change.id);
            return (
              <li
                key={change.id}
                className={`flex items-start gap-3 rounded-lg ${
                  selectionMode ? "cursor-pointer p-1.5 hover:bg-background" : ""
                } ${isSelected ? "bg-accent-soft/40" : ""}`}
                onClick={selectionMode ? () => toggleOne(change.id) : undefined}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(change.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${title}`}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                  />
                )}
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft/40 text-accent">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {title} <span className="font-normal text-muted">— {detail}</span>
                  </p>
                  <p className="text-xs text-muted" title={formatDateTime(change.changed_at, timezone)}>
                    {formatRelative(change.changed_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === "all" ? "Clear all history?" : `Clear ${selectedIds.size} entries?`}
        description="This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={clearing}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={clearing}
              onClick={() => confirming && handleClear(confirming)}
            >
              Clear
            </Button>
          </>
        }
      />
    </div>
  );
}

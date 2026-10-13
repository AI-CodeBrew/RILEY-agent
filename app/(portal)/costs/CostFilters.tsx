"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

export interface RangePreset {
  label: string;
  /** YYYY-MM-DD, or null for an open end. */
  from: string | null;
  to: string | null;
}

/**
 * Agent picker + one-click month ranges for the Costs page. A preset just
 * fills in the same `from`/`to` params the date pickers below it edit, so any
 * preset can be fine-tuned afterwards.
 */
export function CostFilters({
  agents,
  presets,
}: {
  agents: { id: string; name: string }[];
  presets: RangePreset[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const agent = searchParams.get("agent") ?? "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Agent"
        value={agent}
        onChange={(e) => setParams({ agent: e.target.value || null })}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
      >
        <option value="">All agents</option>
        {agents.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>

      {presets.map((preset) => {
        const active = preset.from === from && preset.to === to;
        return (
          <button
            key={preset.label}
            onClick={() => setParams({ from: preset.from, to: preset.to })}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarDays, Clock } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import type { CalendarProvider } from "@/types/database";

const OPTIONS: {
  value: CalendarProvider;
  label: string;
  description: string;
  icon: typeof Clock;
}[] = [
  {
    value: "google",
    label: "Google Calendar",
    description: "Free blocks on your availability calendar, minus your Google meetings. Bookings go on your Google Calendar.",
    icon: CalendarDays,
  },
  {
    value: "calendly",
    label: "Calendly",
    description: "Riley reads and books through your connected Calendly account.",
    icon: CalendarCheck,
  },
  {
    value: "crm",
    label: "Portal weekly hours",
    description: "Your hours from Calendar → Availability. Bookings stay in this portal.",
    icon: Clock,
  },
];

/**
 * Which calendar Riley reads availability from and books into on a call.
 * Options that aren't set up yet are shown but disabled, with what's
 * missing — the API enforces the same rules.
 */
export function BookingCalendarPicker({
  agentId,
  current,
  missing,
}: {
  agentId: string;
  current: CalendarProvider | null;
  /** Why each provider can't be picked yet; absent = ready. */
  missing: Partial<Record<CalendarProvider, string>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState<CalendarProvider | null>(null);

  async function choose(provider: CalendarProvider) {
    if (provider === current || missing[provider]) return;
    setSaving(provider);
    const res = await fetch(`/api/agents/${agentId}/calendar-provider`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendar_provider: provider }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(null);

    if (!res.ok) {
      toast(body.error ?? "Could not change your booking calendar.", "error");
      return;
    }

    toast("Booking calendar updated — Riley uses it from the next call.", "success");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.value === current;
        const blockedReason = missing[option.value];
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            disabled={Boolean(blockedReason) || saving !== null}
            aria-pressed={selected}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
              selected
                ? "border-accent bg-accent-soft"
                : "border-border hover:bg-background disabled:hover:bg-transparent",
              blockedReason && "opacity-60"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className={cn("h-4 w-4", selected ? "text-accent" : "text-muted")} />
              {option.label}
              {selected && (
                <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  In use
                </span>
              )}
              {saving === option.value && <span className="ml-auto text-xs text-muted">Saving…</span>}
            </span>
            <span className="text-xs text-muted">{option.description}</span>
            {blockedReason && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{blockedReason}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

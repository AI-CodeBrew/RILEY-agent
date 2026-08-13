import { cn } from "@/lib/cn";
import type { CallStatus } from "@/types/database";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  call_scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  calling: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  contacted: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  appointment_set: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  follow_up: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  no_answer: "bg-zinc-500/10 text-zinc-500",
  not_interested: "bg-red-500/10 text-red-600 dark:text-red-400",
  do_not_call: "bg-red-500/10 text-red-600 dark:text-red-400",
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  confirmed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  canceled: "bg-red-500/10 text-red-600 dark:text-red-400",
  no_show: "bg-red-500/10 text-red-600 dark:text-red-400",
  voicemail: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  call_back_later: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
  queued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ringing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-red-500/10 text-red-600 dark:text-red-400",
  ended: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  manual: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  voice_agent: "bg-accent-soft text-accent",
  POS: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  UNION: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  WILL_KIT: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
};

const LABELS: Record<string, string> = {
  in_progress: "on the call",
  voice_agent: "Riley",
  manual: "manual",
  WILL_KIT: "Will Kit",
};

export function StatusBadge({
  status,
  pulse = false,
}: {
  status: string | null;
  /** Adds a live ring around the dot — used while a call is connected. */
  pulse?: boolean;
}) {
  if (!status) return <span className="text-muted">—</span>;
  const style = STATUS_STYLES[status] ?? "bg-zinc-500/10 text-zinc-600";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          pulse && "animate-pulse-ring"
        )}
      />
      {LABELS[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

/** Call badges pulse while the call is actually connected. */
export function CallStatusBadge({ status }: { status: CallStatus }) {
  return <StatusBadge status={status} pulse={status === "in_progress"} />;
}

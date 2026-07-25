const STATUS_STYLES: Record<string, string> = {
  new: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  call_scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  calling: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  contacted: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  appointment_set: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
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
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">—</span>;
  const style = STATUS_STYLES[status] ?? "bg-zinc-500/10 text-zinc-600";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

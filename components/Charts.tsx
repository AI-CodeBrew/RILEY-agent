import { cn } from "@/lib/cn";

export interface SeriesPoint {
  label: string;
  /** Full label used in the tooltip — the axis shows the short one. */
  fullLabel?: string;
  value: number;
}

/**
 * Single-series magnitude-over-time bars. One hue (the app accent) because
 * there's only one series — identity never rides on color here, and the
 * heading names what's being counted. Bars are anchored to the baseline with
 * rounded data-ends and a 2px surface gap; the grid stays recessive.
 */
export function TrendBars({
  data,
  emptyLabel = "No activity in this window.",
  className,
}: {
  data: SeriesPoint[];
  emptyLabel?: string;
  className?: string;
}) {
  const max = Math.max(...data.map((point) => point.value), 1);
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const peakIndex = data.findIndex((point) => point.value === max && max > 0);

  if (total === 0) {
    return (
      <p className={cn("py-10 text-center text-sm text-muted", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="relative flex h-40 items-end gap-[2px] border-b border-border">
        {/* Recessive midline so bar heights are readable without a full grid. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" />
        {data.map((point, index) => {
          const heightPct = (point.value / max) * 100;
          return (
            <div
              key={point.label + index}
              className="group relative flex flex-1 items-end justify-center"
              style={{ height: "100%" }}
            >
              {/* Direct-label the peak only; the rest are in the tooltip. */}
              {index === peakIndex && (
                <span className="absolute -top-1 text-[10px] font-medium text-muted">
                  {point.value}
                </span>
              )}
              <div
                className="w-full rounded-t bg-accent transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(heightPct, point.value > 0 ? 4 : 0)}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md group-hover:block">
                <span className="font-medium">{point.value}</span>
                <span className="text-muted"> · {point.fullLabel ?? point.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>{data[0]?.fullLabel ?? data[0]?.label}</span>
        <span>{data.at(-1)?.fullLabel ?? data.at(-1)?.label}</span>
      </div>
    </div>
  );
}

export interface RankedItem {
  label: string;
  value: number;
}

/**
 * Ranked horizontal bars (call outcomes, statuses). Values are direct-labeled
 * at the end of every row, so the bar length is a redundant encoding rather
 * than the only one.
 */
export function RankedBars({
  items,
  emptyLabel = "Nothing to show yet.",
}: {
  items: RankedItem[];
  emptyLabel?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const withValues = items.filter((item) => item.value > 0);

  if (withValues.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {withValues.map((item) => (
        <li key={item.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-muted">{item.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-medium tabular-nums">
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

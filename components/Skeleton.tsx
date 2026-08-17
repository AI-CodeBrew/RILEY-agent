import { cn } from "@/lib/cn";

/** Base pulsing placeholder block — compose into page-shaped skeletons below. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}

/** Mirrors PageHeader's title/description/action layout while the real data loads. */
export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {withAction && <Skeleton className="h-10 w-32 rounded-lg" />}
    </div>
  );
}

/** Mirrors the `grid-cols-1 gap-4 sm:grid-cols-3` StatCard rows used across pages. */
export function StatCardsSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the bordered `<Card>` + `<table>` list pattern used on most list pages. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the search/filter-pill row that sits above most tables. */
export function FiltersSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-9 w-64 rounded-lg" />
      <Skeleton className="h-8 w-20 rounded-full" />
      <Skeleton className="h-8 w-24 rounded-full" />
      <Skeleton className="h-8 w-16 rounded-full" />
    </div>
  );
}

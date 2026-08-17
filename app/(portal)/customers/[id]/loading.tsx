import { Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function CustomerDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      <section>
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <Skeleton className="h-24 w-full" />
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-4 w-32" />
        <TableSkeleton rows={3} />
      </section>

      <section>
        <Skeleton className="mb-3 h-4 w-28" />
        <TableSkeleton rows={4} />
      </section>
    </div>
  );
}

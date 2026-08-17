import {
  PageHeaderSkeleton,
  Skeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />

      <StatCardsSkeleton count={5} className="lg:grid-cols-3 xl:grid-cols-5" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Skeleton className="mb-3 h-4 w-24" />
          <TableSkeleton rows={4} />
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <TableSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}

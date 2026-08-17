import { PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

export default function AIIntegrationLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <Skeleton className="mb-4 h-4 w-24" />
          <div className="space-y-3">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-2/3 rounded-lg" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

import { PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

function SettingsCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <Skeleton className="mb-4 h-4 w-28" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-2/3 rounded-lg" />
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
      </div>
      <SettingsCardSkeleton />
    </div>
  );
}

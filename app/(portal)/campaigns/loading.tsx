import { PageHeaderSkeleton, Skeleton, StatCardsSkeleton } from "@/components/Skeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={3} />
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

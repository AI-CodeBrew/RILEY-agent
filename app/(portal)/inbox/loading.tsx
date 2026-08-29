import { PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

export default function InboxLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <Skeleton className="h-[32rem] w-full rounded-xl" />
    </div>
  );
}

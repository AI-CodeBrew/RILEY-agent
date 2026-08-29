import { PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function ForumLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <TableSkeleton rows={8} />
    </div>
  );
}

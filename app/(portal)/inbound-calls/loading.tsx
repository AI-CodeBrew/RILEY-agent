import { PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function InboundCallsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}

import {
  FiltersSkeleton,
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/Skeleton";

export default function CallsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={3} />
      <FiltersSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}

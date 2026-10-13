import { FiltersSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function CostsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FiltersSkeleton />
      <TableSkeleton rows={4} />
    </div>
  );
}

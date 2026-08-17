import {
  FiltersSkeleton,
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/Skeleton";

export default function AppointmentsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <StatCardsSkeleton count={3} />
      <FiltersSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}

import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function AgentsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <section>
        <Skeleton className="mb-3 h-4 w-40" />
        <TableSkeleton rows={2} />
      </section>
      <section>
        <Skeleton className="mb-3 h-4 w-16" />
        <TableSkeleton rows={6} />
      </section>
    </div>
  );
}

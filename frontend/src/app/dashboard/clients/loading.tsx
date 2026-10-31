import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/ui';

/** Mirrors the clients page: filter bar, then the client rows. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <LoadingRegion label="Loading clients" className="flex flex-wrap gap-3">
        <Skeleton className="h-10 min-w-48 flex-1" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </LoadingRegion>
      <ListSkeleton rows={5} className="space-y-2" />
    </div>
  );
}

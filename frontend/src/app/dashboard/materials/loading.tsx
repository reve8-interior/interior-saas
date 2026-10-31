import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/ui';

/** Mirrors the materials page: summary card, then the material rows. */
export default function Loading() {
  return (
    <LoadingRegion label="Loading materials" className="space-y-6">
      <Skeleton className="h-24 rounded-2xl" />
      <ListSkeleton rows={6} rowClassName="h-14" className="space-y-2" />
    </LoadingRegion>
  );
}

import { LoadingRegion, Skeleton } from '@/components/ui';
import { PHASES } from '@/lib/constants';

/** Mirrors the board: one column per phase. */
export default function Loading() {
  return (
    <LoadingRegion label="Loading board" className="flex gap-3">
      {PHASES.map((phase) => (
        <Skeleton key={phase} className="h-64 flex-1 rounded-2xl" />
      ))}
    </LoadingRegion>
  );
}

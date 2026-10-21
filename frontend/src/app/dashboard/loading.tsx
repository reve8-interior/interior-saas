import { PageSkeleton } from '@/components/ui';

/** Route-level fallback shown instantly while the segment streams in. */
export default function Loading() {
  return <PageSkeleton />;
}

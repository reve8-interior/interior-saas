import { ListSkeleton } from '@/components/ui';

/** Mirrors the shared-links page: a stack of link rows. */
export default function Loading() {
  return <ListSkeleton rows={4} rowClassName="h-24" />;
}

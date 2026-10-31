import { ListSkeleton } from '@/components/ui';

/** Mirrors the meeting notes page: a stack of meeting rows. */
export default function Loading() {
  return <ListSkeleton rows={3} rowClassName="h-24" />;
}

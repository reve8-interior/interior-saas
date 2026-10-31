import { GridSkeleton } from '@/components/ui';

/** Mirrors the designs tab: a grid of design cards. */
export default function Loading() {
  return <GridSkeleton items={3} />;
}

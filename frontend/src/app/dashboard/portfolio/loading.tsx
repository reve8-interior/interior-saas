import { GridSkeleton } from '@/components/ui';

/** Mirrors the portfolio page: a grid of design cards. */
export default function Loading() {
  return <GridSkeleton items={6} />;
}

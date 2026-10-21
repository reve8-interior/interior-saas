import type { ReactNode } from 'react';

/** Single shimmering placeholder block. Decorative: hidden from assistive tech. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/**
 * Wraps a group of skeletons so screen readers announce one "Loading" status
 * instead of reading N empty blocks. Every page-level skeleton goes inside one.
 */
export function LoadingRegion({
  label = 'Loading',
  className = '',
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Fixed-height block sized to the content it stands in for (prevents CLS). */
export function BlockSkeleton({ className = 'h-48' }: { className?: string }) {
  return (
    <LoadingRegion>
      <Skeleton className={`rounded-2xl ${className}`} />
    </LoadingRegion>
  );
}

/** A stack of equal-height rows (client list, checkpoints, etc.). */
export function ListSkeleton({
  rows = 4,
  rowClassName = 'h-16',
  className = 'space-y-3',
}: {
  rows?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`w-full rounded-2xl ${rowClassName}`} />
      ))}
    </LoadingRegion>
  );
}

/** Responsive grid of card-shaped placeholders (designs, portfolio). */
export function GridSkeleton({
  items = 6,
  itemClassName = 'h-48',
  className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: {
  items?: number;
  itemClassName?: string;
  className?: string;
}) {
  return (
    <LoadingRegion className={className}>
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className={`rounded-2xl ${itemClassName}`} />
      ))}
    </LoadingRegion>
  );
}

/** Page heading + subtitle placeholder. */
export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingRegion className="space-y-4 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function CardSkeleton() {
  return (
    <LoadingRegion className="surface space-y-3 p-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </LoadingRegion>
  );
}

/** Generic dashboard-page placeholder used by route-level loading.tsx files. */
export function PageSkeleton() {
  return (
    <LoadingRegion className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </LoadingRegion>
  );
}

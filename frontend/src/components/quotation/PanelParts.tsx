'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { listDesigns } from '@/lib/designs';
import type { Design } from '@/lib/schemas/design';

export const imageCount = (roomDesigns: Record<string, string[]>) =>
  Object.values(roomDesigns).flat().length;

export function useClientDesigns(clientId: string) {
  return useQuery<Design[]>({
    queryKey: ['designs', clientId],
    queryFn: () => listDesigns(clientId),
  });
}

/** Scrolls its content; the footer (Save, Create…) stays pinned and visible. */
export function ScrollPanel({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-22rem)] min-h-72 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">{children}</div>
      {footer && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4 dark:border-line">
          {footer}
        </div>
      )}
    </div>
  );
}

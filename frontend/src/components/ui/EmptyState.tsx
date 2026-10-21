import type { ReactNode } from 'react';

/** Dashed placeholder shown when a list or section has nothing in it yet. */
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-12 text-center dark:border-primary-300/15">
      <p className="text-dark-500 dark:text-dark-400">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

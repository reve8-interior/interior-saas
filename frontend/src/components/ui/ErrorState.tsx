import type { ReactNode } from 'react';

/** Shown when a list or page fails to load; offers a retry instead of a blank screen. */
export function ErrorState({
  children = "Couldn't load this. Check your connection and try again.",
  onRetry,
}: {
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed border-red-300 p-12 text-center dark:border-red-500/40"
    >
      <p className="text-dark-600 dark:text-dark-300">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-4">
          Try again
        </button>
      )}
    </div>
  );
}

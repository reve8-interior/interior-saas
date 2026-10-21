import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLS: Record<BadgeTone, string> = {
  success:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  warning:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  neutral:
    'bg-primary-100/70 text-gray-600 dark:bg-white/10 dark:text-dark-300',
};

/** Pill-shaped status chip. Pair it with text so colour is never the only cue. */
export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[tone]}`}
    >
      {children}
    </span>
  );
}

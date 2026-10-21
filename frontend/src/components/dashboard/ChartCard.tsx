import { CARD_CLS } from '@/lib/constants';
import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  /** One line under the title saying what the chart measures. */
  description?: string;
  /** Headline figure shown top-right (kept in ink, never series colour). */
  stat?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Shared frame so every dashboard panel has the same header rhythm. */
export function ChartCard({
  title,
  description,
  stat,
  className = '',
  children,
}: ChartCardProps) {
  return (
    <section className={`${CARD_CLS} flex h-full flex-col p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold tracking-tight text-dark-900 dark:text-white">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-dark-500 dark:text-dark-400">
              {description}
            </p>
          )}
        </div>
        {stat && <div className="shrink-0 text-right">{stat}</div>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-line text-xs text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
      {message}
    </div>
  );
}

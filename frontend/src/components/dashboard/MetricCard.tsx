import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CARD_CLS } from '@/lib/constants';

export type MetricTone =
  | 'brand'
  | 'green'
  | 'blue'
  | 'amber'
  | 'violet'
  | 'red';

const TONES: Record<MetricTone, string> = {
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  brand: 'bg-brand/10 text-accent-text',
  green: 'bg-brand/10 text-accent-text',
  blue: 'bg-brand/10 text-accent-text',
  amber: 'bg-brand/10 text-accent-text',
  violet: 'bg-brand/10 text-accent-text',
};

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  subvalue?: string;
  tone?: MetricTone;
  /** Makes the whole card a link to the page behind this number. */
  href?: string;
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  subvalue,
  tone = 'brand',
  href,
}: MetricCardProps) {
  const cardCls = `${CARD_CLS} flex flex-col justify-between gap-4 p-5`;
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="type-label min-w-0">{label}</span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="truncate text-3xl font-extrabold tabular-nums tracking-tight text-dark-900 dark:text-white">
          {value}
        </p>
        <p className="mt-1.5 min-h-[1rem] text-xs text-dark-500 dark:text-dark-400">
          {sublabel && subvalue && (
            <>
              {sublabel}{' '}
              <span className="font-semibold tabular-nums text-dark-700 dark:text-dark-200">
                {subvalue}
              </span>
            </>
          )}
        </p>
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`${cardCls} transition-shadow hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}
    >
      {body}
    </Link>
  ) : (
    <div className={cardCls}>{body}</div>
  );
}

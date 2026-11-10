'use client';

import { AccessStatus, UsageMeter } from '@/lib/schemas/auth';
import { meterState, meterWarnings } from '@/lib/usage';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

interface Props {
  access: AccessStatus | undefined;
  /** Metered limits; any at or near their cap show an upgrade nudge. */
  meters?: UsageMeter[];
  children: ReactNode;
}

/** Shows the plan-ending countdown, or the moved-to-Free notice once a paid plan lapses. */
export function AccessGate({ access, meters = [], children }: Props) {
  const showBanner =
    access?.days_left != null && access.days_left <= access.warning_days;
  const warnings = meterWarnings(meters);

  return (
    <>
      {access?.expired && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your paid plan has ended, so you are now on the Free plan. Only Free
            limits apply now. Upgrade to unlock the remaining clients, designs,
            portfolio designs, website and more. Your data is safe.{' '}
            <Link href="/dashboard/billing" className="font-semibold underline">
              Upgrade now
            </Link>
          </span>
        </div>
      )}
      {showBanner && !access?.expired && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {access.days_left === 0
              ? 'Last day of your plan — renew today to keep everything.'
              : `${access.days_left} day${access.days_left === 1 ? '' : 's'} left on your plan.`}{' '}
            After that you move to the Free plan.
          </span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {warnings
              .map(
                (m) =>
                  `${m.label}: ${m.used} of ${m.limit}${
                    meterState(m.used, m.limit) === 'full' ? ' (full)' : ''
                  }`
              )
              .join(' · ')}
            .{' '}
            <Link href="/dashboard/billing" className="font-semibold underline">
              Upgrade your plan
            </Link>
          </span>
        </div>
      )}
      {children}
    </>
  );
}

'use client';

import { AccessStatus } from '@/lib/schemas/auth';
import { AlertTriangle, Lock } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  access: AccessStatus | undefined;
  children: ReactNode;
}

/** Shows the payment countdown banner, or blocks the portal once expired. */
export function AccessGate({ access, children }: Props) {
  if (access?.expired) {
    return (
      <div className="surface mx-auto mt-16 max-w-md !border-red-200 p-8 text-center dark:!border-red-500/30">
        <Lock className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h2 className="mb-2 text-lg font-extrabold tracking-tight">
          Access expired
        </h2>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Your access period has ended. Clients, board, conversations and
          quotations are locked until your administrator renews your plan. Your
          data is safe.
        </p>
      </div>
    );
  }

  const showBanner =
    access?.days_left != null && access.days_left <= access.warning_days;

  return (
    <>
      {showBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {access.days_left === 0
              ? 'Last day of access — payment is due today.'
              : `${access.days_left} day${access.days_left === 1 ? '' : 's'} left to make your payment.`}{' '}
            After that, the portal will be locked.
          </span>
        </div>
      )}
      {children}
    </>
  );
}

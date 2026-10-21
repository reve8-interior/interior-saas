'use client';

import { PasswordCard } from '@/components/settings/AccountSettings';
import { KeyRound } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  required: boolean | undefined;
  children: ReactNode;
}

/** Blocks the portal until a temporary password has been replaced. */
export function PasswordGate({ required, children }: Props) {
  if (!required) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md space-y-4">
      <div className="text-center">
        <KeyRound className="mx-auto mb-3 h-10 w-10 text-primary-500" />
        <h2 className="mb-1 text-xl font-extrabold tracking-tight">
          Set a new password
        </h2>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          You signed in with a temporary password. Choose your own to continue.
        </p>
      </div>
      <PasswordCard />
    </div>
  );
}

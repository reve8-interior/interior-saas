'use client';

import { Logo } from '@/components/ui/Logo';
import { acceptInvite } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { MIN_PASSWORD_LENGTH } from '@/lib/teamForm';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

function AcceptInviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await acceptInvite(token, password);
      setDone(true);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not accept the invite'));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo size={28} />
        </div>
        <div className="surface p-6 sm:p-8">
          {done ? (
            <div className="space-y-4 text-center">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-dark-900 dark:text-white">
                Email confirmed
              </h1>
              <p className="text-sm text-dark-500 dark:text-dark-400">
                Your password is set. You can sign in now.
              </p>
              <Link href="/login" className="btn-primary w-full">
                Go to sign in
              </Link>
            </div>
          ) : !token ? (
            <p role="alert" className="text-center text-sm">
              This invite link is incomplete. Open the link from your email, or
              ask your admin to send a new one.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="text-center">
                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-dark-900 dark:text-white">
                  Set your password
                </h1>
                <p className="mt-2 text-sm text-dark-500 dark:text-dark-400">
                  This confirms your email and finishes setting up your account.
                </p>
              </div>
              <div>
                <label htmlFor="invite-password" className="label-text">
                  New password
                </label>
                <input
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  className="field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="invite-confirm" className="label-text">
                  Confirm password
                </label>
                <input
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="field"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Saving...' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}

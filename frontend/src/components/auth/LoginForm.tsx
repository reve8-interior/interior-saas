'use client';

import { MARKETING_URL } from '@/lib/constants';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { errorMessage } from '@/lib/errors';

export interface LoginFormProps {
  /** Icon shown in the card header circle */
  icon: ReactNode;
  title: string;
  subtitle: string;
  portalLabel: string;
  onSubmit: (
    email: string,
    password: string,
    rememberMe: boolean
  ) => Promise<void>;
  showRememberMe?: boolean;
  showSignUpLink?: boolean;
  signUpHref?: string;
  successMessage?: string;
  footer?: ReactNode;
}

const FIELD_CLS =
  'w-full rounded-xl border border-line bg-white/80 py-3 pl-11 text-dark-900 placeholder:text-dark-400 transition-colors focus:border-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-600/30 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-white';

export function LoginForm({
  icon,
  title,
  subtitle,
  portalLabel,
  onSubmit,
  showRememberMe = false,
  showSignUpLink = false,
  signUpHref = '/signup',
  successMessage,
  footer,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(email, password, rememberMe);
    } catch (err: unknown) {
      const message = errorMessage(err, 'Failed to sign in');
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-10 w-10" />
            <span className="font-heading text-[32px] font-extrabold tracking-tight">
              <span className="text-[#1573cc]">reve</span>
              <span className="text-dark-900 dark:text-white">8</span>
            </span>
          </Link>
          <p className="eyebrow mt-3">{portalLabel}</p>
        </div>

        {/* Card */}
        <div className="surface p-6 sm:p-8">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
              {icon}
            </div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-dark-900 dark:text-white">
              {title}
            </h1>
            <p className="mt-2 text-sm text-dark-500 dark:text-dark-400">
              {subtitle}
            </p>
          </div>

          {successMessage && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-400/20 dark:bg-green-500/10 dark:text-green-300">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="label-text">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-dark-500 dark:text-dark-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${FIELD_CLS} pr-4`}
                  placeholder="user@example.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label-text">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-dark-500 dark:text-dark-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD_CLS} pr-12`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {showRememberMe && (
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded-lg border-line text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-dark-500 dark:text-dark-400">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary h-12 w-full text-base"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {showSignUpLink && (
            <p className="mt-6 text-center text-sm text-dark-500 dark:text-dark-400">
              Don&apos;t have an account?{' '}
              <Link
                href={signUpHref}
                className="font-semibold text-primary-600 hover:underline dark:text-primary-400"
              >
                Sign up
              </Link>
            </p>
          )}
          {footer}
        </div>

        <p className="mt-6 text-center text-sm text-dark-500 dark:text-dark-400">
          <Link
            href={MARKETING_URL}
            className="hover:text-primary-600 dark:hover:text-primary-400"
          >
            ← Back to website
          </Link>
        </p>
      </div>
    </div>
  );
}

'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useSampleClient } from '@/lib/useSampleClient';

const DISMISS_KEY = 'get-started-dismissed';

interface Step {
  label: string;
  hint: string;
  href?: string;
  onClick?: () => void;
  done: boolean;
}

/** First-run checklist; hides itself once dismissed or all steps are done. */
export function GetStartedCard({
  hasClients,
  onAddClient,
}: {
  hasClients: boolean;
  onAddClient: () => void;
}) {
  const { load } = useSampleClient();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || hasClients) return null;

  const steps: Step[] = [
    {
      label: 'Choose your quotation columns',
      hint: 'Decide which fields your quotations show.',
      href: '/dashboard/settings/columns',
      done: false,
    },
    {
      label: 'Add your materials and rates',
      hint: 'Import from Excel or add them one by one.',
      href: '/dashboard/materials',
      done: false,
    },
    {
      label: 'Add your first client',
      hint: 'Then paste meeting notes to build their quotation.',
      onClick: onAddClient,
      done: hasClients,
    },
  ];

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage unavailable; the card reappears next visit.
    }
  };

  return (
    <section aria-label="Get started" className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-dark-900 dark:text-white">
            Get started
          </h2>
          <p className="text-sm text-dark-500 dark:text-dark-400">
            Three steps to your first quotation.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="btn-secondary">
          Dismiss
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          const body = (
            <>
              <Icon
                className={`h-5 w-5 shrink-0 ${step.done ? 'text-green-600' : 'text-dark-400'}`}
                aria-hidden
              />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold text-dark-900 dark:text-white">
                  {i + 1}. {step.label}
                </span>
                <span className="block text-xs text-dark-500 dark:text-dark-400">
                  {step.hint}
                </span>
              </span>
            </>
          );
          const cls =
            'flex min-h-11 w-full items-center gap-3 rounded-xl border border-line px-3 py-2 hover:bg-primary-50/70 dark:hover:bg-white/[0.06]';
          return (
            <li key={step.label}>
              {step.href ? (
                <Link href={step.href} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={step.onClick} className={cls}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => load.mutate()}
        disabled={load.isPending}
        className="btn-secondary mt-3 min-h-11"
      >
        {load.isPending ? 'Loading…' : 'Or explore with a sample client'}
      </button>
    </section>
  );
}

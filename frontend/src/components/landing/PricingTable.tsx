'use client';

import { formatInr, monthsFree, yearlyPerMonth } from '@/lib/plans';
import { planFeatureLines } from '@/lib/pricingRows';
import type { PublicPlan } from '@/lib/schemas/plan';
import { REQUEST_ACCESS_HREF } from '@/lib/constants';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type Cycle = 'monthly' | 'yearly';

const MUTED = 'text-dark-500 dark:text-dark-400';

/** Price block for one card: the figure, what it covers, and any saving. */
function Price({ plan, cycle }: { plan: PublicPlan; cycle: Cycle }) {
  if (plan.price_monthly_inr === null) {
    return (
      <>
        <p className="text-4xl font-extrabold">₹0</p>
        <p className={`mt-1 text-sm ${MUTED}`}>Free forever</p>
      </>
    );
  }
  const yearly = cycle === 'yearly' && plan.price_yearly_inr !== null;
  const perMonth = yearly ? yearlyPerMonth(plan) : plan.price_monthly_inr;
  const free = monthsFree(plan);
  return (
    <>
      <p className="text-4xl font-extrabold">
        {formatInr(perMonth ?? plan.price_monthly_inr)}
        <span className={`text-base font-medium ${MUTED}`}>/mo</span>
      </p>
      <p className={`mt-1 text-sm ${MUTED}`}>
        {yearly && plan.price_yearly_inr !== null
          ? `${formatInr(plan.price_yearly_inr)} billed yearly${free > 0 ? ` · ${free} months free` : ''}`
          : 'Billed monthly · cancel any time'}
      </p>
    </>
  );
}

/** Plan cards with a monthly / yearly switch. The recommended plan stands out. */
export function PricingTable({ plans }: { plans: PublicPlan[] }) {
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const hasYearly = plans.some((p) => p.price_yearly_inr !== null);
  const saving = Math.max(0, ...plans.map(monthsFree));

  return (
    <div>
      {hasYearly && (
        <div
          role="tablist"
          aria-label="Billing period"
          className="seg mx-auto mb-8 w-fit"
        >
          {(['monthly', 'yearly'] as const).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cycle === c}
              onClick={() => setCycle(c)}
              className="seg-btn min-h-11 whitespace-nowrap px-5"
            >
              {c === 'monthly'
                ? 'Monthly'
                : `Yearly${saving > 0 ? ` · ${saving} months free` : ''}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.slug}
            className={`surface relative flex flex-col p-6 ${
              plan.is_recommended
                ? 'ring-2 ring-primary-500 lg:-translate-y-2'
                : ''
            }`}
          >
            {plan.is_recommended && (
              <span className="absolute -top-3 left-6 rounded-full bg-primary-600 px-3 py-0.5 text-xs font-semibold text-white">
                Recommended
              </span>
            )}
            <h3 className="font-heading text-lg font-extrabold">{plan.name}</h3>
            {plan.tagline && (
              <p className={`mt-1 text-sm ${MUTED}`}>{plan.tagline}</p>
            )}
            <div className="mt-5">
              <Price plan={plan} cycle={cycle} />
            </div>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {planFeatureLines(plan).map((line) => (
                <li key={line} className="flex gap-2">
                  <Check
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary-500"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {plan.price_monthly_inr === null ? (
              <Link href="/login" className="btn-secondary mt-6">
                Start free
              </Link>
            ) : (
              <a
                href={REQUEST_ACCESS_HREF}
                className={`mt-6 ${plan.is_recommended ? 'btn-primary' : 'btn-secondary'}`}
              >
                Get {plan.name}
              </a>
            )}
          </div>
        ))}
      </div>
      <p className={`mt-6 text-center text-xs ${MUTED}`}>
        Prices in INR, per studio, not per seat.
      </p>
    </div>
  );
}

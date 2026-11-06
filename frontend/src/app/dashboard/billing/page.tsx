'use client';

import { ChangePlanDialog } from '@/components/billing/ChangePlanDialog';
import { ReceiptDialog } from '@/components/billing/ReceiptDialog';
import { ConfirmDeleteModal, ErrorState, PageLoader } from '@/components/ui';
import {
  blockedReason,
  cancelSubscription,
  formatDate,
  formatPaise,
  getBillingStatus,
  getReceipts,
  isGranted,
  isPaying,
  openCheckout,
  periodLine,
  planAction,
  startCheckout,
  statusLabel,
  verifyPayment,
} from '@/lib/billing';
import { errorMessage } from '@/lib/errors';
import { formatInr, monthsFree, yearlyPerMonth } from '@/lib/plans';
import { planFeatureLines } from '@/lib/pricingRows';
import { getMe } from '@/lib/profile';
import { api } from '@/lib/api';
import type {
  BillingCycle,
  ChangeDirection,
  ChangePlanResponse,
  CheckoutResponse,
  CheckoutResult,
  Receipt,
} from '@/lib/schemas/billing';
import type { PublicPlan } from '@/lib/schemas/plan';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const POLL_MS = 2000;
const POLL_TRIES = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BillingPage() {
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const isAdmin = me?.role === 'admin';
  const status = useQuery({
    queryKey: ['billing-status'],
    queryFn: getBillingStatus,
    enabled: isAdmin,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ['billing-receipts'],
    queryFn: getReceipts,
    enabled: isAdmin,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get<PublicPlan[]>('/plans'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['billing-status'] });
    qc.invalidateQueries({ queryKey: ['billing-receipts'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  /** The webhook moves the plan; wait briefly for it, then refresh. */
  async function waitForPlan(slug: string) {
    for (let i = 0; i < POLL_TRIES; i++) {
      await sleep(POLL_MS);
      const latest = await getBillingStatus();
      if (latest.plan === slug && latest.subscription_status === 'active') {
        refresh();
        toast.success(`You're on ${latest.plan_name}`);
        return;
      }
    }
    refresh();
    toast.message('Payment received. Your plan will update in a minute.');
  }

  /** Opens Razorpay for a checkout, verifies it, then runs `after`. */
  async function pay(
    checkout: CheckoutResponse,
    slug: string,
    after: () => Promise<void>
  ) {
    setBusy(slug);
    try {
      await openCheckout(
        checkout,
        me?.email ?? '',
        async (result: CheckoutResult) => {
          try {
            const { verified } = await verifyPayment(result);
            if (!verified) {
              toast.error('We could not confirm that payment.');
              return;
            }
            await after();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(null);
          }
        },
        () => setBusy(null),
        (message) => toast.error(message)
      );
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function subscribe(plan: PublicPlan) {
    setBusy(plan.slug);
    try {
      const checkout = await startCheckout({
        plan_slug: plan.slug,
        billing_cycle: viewCycle,
      });
      await pay(checkout, plan.slug, () => waitForPlan(plan.slug));
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  /** The customer confirmed a plan switch in the dialog. */
  async function switchConfirmed(
    response: ChangePlanResponse,
    direction: ChangeDirection
  ) {
    const slug = changing;
    setChanging(null);
    if (response.mode === 'scheduled' || !response.checkout || !slug) {
      toast.success(response.message);
      refresh();
      return;
    }
    await pay(response.checkout, slug, async () => {
      if (direction === 'upgrade') {
        await waitForPlan(slug);
        return;
      }
      // Downgrade / resume: authorised now, takes effect at period end.
      await sleep(POLL_MS);
      refresh();
      toast.success('Done. Your plan change is scheduled.');
    });
  }

  const cancel = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      toast.success(
        'Subscription cancelled. Access continues until the end of the paid period.'
      );
      setConfirmingCancel(false);
      refresh();
    },
    onError: (err) => {
      setConfirmingCancel(false);
      toast.error(errorMessage(err));
    },
  });

  if (me && !isAdmin) {
    return (
      <p className="surface mx-auto max-w-lg p-6 text-center text-sm">
        Only your business admin can manage the plan. Ask them to upgrade.
      </p>
    );
  }
  if (status.isLoading || !me) return <PageLoader />;
  if (status.isError || !status.data) {
    return <ErrorState onRetry={() => status.refetch()} />;
  }

  const s = status.data;
  // Subscribers change plan within their billing period; others pick one.
  const viewCycle: BillingCycle =
    s.can_change_plan && s.billing_cycle ? s.billing_cycle : cycle;
  const currentPlan = plans.find((p) => p.slug === s.plan);
  const line = periodLine(s);
  const paid = plans.filter((p) => p.price_monthly_inr !== null);
  const saving = Math.max(0, ...paid.map(monthsFree));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="surface space-y-2 p-5">
        <p className="field-label !mb-0">Current plan</p>
        <h2 className="font-heading text-2xl font-extrabold">{s.plan_name}</h2>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          {isGranted(s)
            ? 'Included in your account'
            : statusLabel(s.subscription_status)}
          {line ? ` · ${line}` : ''}
        </p>
        {s.subscription_status === 'halted' && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Your last payment failed. Update your payment method in Razorpay or
            subscribe again below.
          </p>
        )}
        {s.pending_plan_name && s.pending_change_on && (
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Switching to {s.pending_plan_name} on{' '}
            {formatDate(s.pending_change_on)}.{' '}
            <button className="underline" onClick={() => setChanging(s.plan)}>
              Keep {s.plan_name}
            </button>
          </p>
        )}
        {s.can_cancel && (
          <button
            className="btn-secondary mt-2"
            disabled={cancel.isPending}
            onClick={() => setConfirmingCancel(true)}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel subscription'}
          </button>
        )}
      </section>

      <ConfirmDeleteModal
        isOpen={confirmingCancel}
        isLoading={cancel.isPending}
        title="Cancel subscription?"
        description="Your plan will not renew. You keep access until the end of the paid period."
        confirmLabel="Cancel subscription"
        loadingLabel="Cancelling..."
        cancelLabel="Keep subscription"
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirmingCancel(false)}
      />

      {!s.payments_enabled && (
        <p className="surface p-4 text-sm">
          Online payments aren&apos;t switched on yet. Contact support to change
          your plan.
        </p>
      )}

      {s.can_change_plan ? (
        <p className="text-center text-sm text-dark-500 dark:text-dark-400">
          Your plan is billed {s.billing_cycle}. Switch below; upgrades start
          now, downgrades at the end of the period.
        </p>
      ) : (
        <div
          role="tablist"
          aria-label="Billing period"
          className="seg mx-auto w-fit"
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {paid.map((plan) => {
          const yearly =
            viewCycle === 'yearly' && plan.price_yearly_inr !== null;
          const perMonth = yearly
            ? yearlyPerMonth(plan)
            : plan.price_monthly_inr;
          const action = planAction(s, plan, currentPlan, viewCycle);
          return (
            <div
              key={plan.slug}
              className={`surface flex flex-col p-5 ${
                plan.is_recommended ? 'ring-2 ring-primary-500' : ''
              }`}
            >
              <h3 className="font-heading text-lg font-extrabold">
                {plan.name}
              </h3>
              <p className="mt-3 text-3xl font-extrabold">
                {formatInr(perMonth ?? 0)}
                <span className="text-base font-medium text-dark-500 dark:text-dark-400">
                  /mo
                </span>
              </p>
              <p className="mt-1 text-xs text-dark-500 dark:text-dark-400">
                {yearly && plan.price_yearly_inr !== null
                  ? `${formatInr(plan.price_yearly_inr)} billed yearly`
                  : s.first_month_offer_available
                    ? 'Billed monthly · first month discounted'
                    : 'Billed monthly'}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {planFeatureLines(plan)
                  .slice(0, 6)
                  .map((l) => (
                    <li key={l} className="flex gap-2">
                      <Check
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary-500"
                      />
                      {l}
                    </li>
                  ))}
              </ul>
              <button
                className="btn-primary mt-5"
                disabled={
                  !s.payments_enabled || busy !== null || action.kind === 'none'
                }
                title={action.title}
                onClick={() =>
                  action.kind === 'change'
                    ? setChanging(plan.slug)
                    : subscribe(plan)
                }
              >
                {busy === plan.slug ? 'Opening…' : action.label}
              </button>
            </div>
          );
        })}
      </div>
      {receipts.length > 0 && (
        <section className="surface space-y-3 p-5">
          <h3 className="font-heading text-lg font-extrabold">Receipts</h3>
          <ul className="divide-y divide-dark-200/60 dark:divide-dark-700/60">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{r.receipt_number}</span>
                  <span className="text-dark-500 dark:text-dark-400">
                    {' '}
                    · {formatDate(r.paid_at)} · {r.plan_name} ({r.billing_cycle}
                    )
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">
                    {formatPaise(r.amount_paise)}
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => setViewing(r)}
                  >
                    View receipt
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ChangePlanDialog
        planSlug={changing}
        onClose={() => setChanging(null)}
        onConfirmed={switchConfirmed}
      />
      <ReceiptDialog receipt={viewing} onClose={() => setViewing(null)} />
      <p className="text-center text-xs text-dark-500 dark:text-dark-400">
        Payments are handled securely by Razorpay. Prices in INR, per studio.
      </p>
    </div>
  );
}

import { api } from '@/lib/api';
import type { PublicPlan } from '@/lib/schemas/plan';
import type {
  BillingCycle,
  BillingStatus,
  CheckoutRequest,
  CheckoutResponse,
  ChangePlanResponse,
  ChangeQuote,
  CheckoutResult,
  PlanSyncResult,
  Receipt,
} from '@/lib/schemas/billing';

export function getBillingStatus(): Promise<BillingStatus> {
  return api.get<BillingStatus>('/billing/status');
}

export function startCheckout(
  body: CheckoutRequest
): Promise<CheckoutResponse> {
  return api.post<CheckoutResponse>('/billing/checkout', body);
}

export function verifyPayment(
  result: CheckoutResult
): Promise<{ verified: boolean }> {
  return api.post<{ verified: boolean }>('/billing/verify', result);
}

export function cancelSubscription(): Promise<BillingStatus> {
  return api.post<BillingStatus>('/billing/cancel', {});
}

export function getChangeQuote(planSlug: string): Promise<ChangeQuote> {
  return api.get<ChangeQuote>(
    `/billing/change-plan/quote?plan_slug=${encodeURIComponent(planSlug)}`
  );
}

export function changePlan(planSlug: string): Promise<ChangePlanResponse> {
  return api.post<ChangePlanResponse>('/billing/change-plan', {
    plan_slug: planSlug,
  });
}

export function getReceipts(): Promise<Receipt[]> {
  return api.get<Receipt[]>('/billing/receipts');
}

export function syncPlanToRazorpay(planId: string): Promise<PlanSyncResult> {
  return api.post<PlanSyncResult>(`/admin/plans/${planId}/sync-razorpay`, {});
}

const STATUS_LABELS: Record<string, string> = {
  none: 'No subscription',
  created: 'Awaiting payment',
  active: 'Active',
  pending: 'Payment pending',
  halted: 'Payment failed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** A paid plan with no subscription behind it was granted by an admin. */
export function isGranted(status: BillingStatus): boolean {
  return status.subscription_status === 'none' && status.plan !== 'free';
}

/** Whether the business pays for its plan right now. */
export function isPaying(status: BillingStatus): boolean {
  return status.subscription_status === 'active';
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Paise as rupees, e.g. 999000 -> "₹9,990.00". */
export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface PlanAction {
  /** subscribe: pay for it; change: switch from the current plan. */
  kind: 'subscribe' | 'change' | 'none';
  label: string;
  title?: string;
}

function priceFor(plan: PublicPlan, cycle: BillingCycle): number {
  return (
    (cycle === 'yearly' ? plan.price_yearly_inr : plan.price_monthly_inr) ?? 0
  );
}

/** What the button on one plan card does for this customer. */
export function planAction(
  s: BillingStatus,
  plan: PublicPlan,
  current: PublicPlan | undefined,
  viewCycle: BillingCycle
): PlanAction {
  if (!s.can_change_plan) {
    const isCurrent = s.plan === plan.slug && isPaying(s);
    if (!s.can_buy) {
      return {
        kind: 'none',
        label: isCurrent ? 'Current plan' : `Choose ${plan.name}`,
        title: blockedReason(s),
      };
    }
    const renew = isCurrent && viewCycle === 'yearly';
    return {
      kind: 'subscribe',
      label: renew
        ? 'Renew'
        : isCurrent
          ? 'Current plan'
          : `Choose ${plan.name}`,
    };
  }
  const cycle = s.billing_cycle ?? viewCycle;
  const yearlyRenewalOpen = cycle === 'yearly' && s.can_buy;
  if (plan.slug === s.plan) {
    if (cycle === 'monthly' && s.subscription_status === 'cancelled') {
      return { kind: 'change', label: 'Resume' };
    }
    if (s.pending_plan) return { kind: 'change', label: `Keep ${plan.name}` };
    if (yearlyRenewalOpen) return { kind: 'subscribe', label: 'Renew' };
    return { kind: 'none', label: 'Current plan', title: blockedReason(s) };
  }
  if (plan.slug === s.pending_plan) {
    return yearlyRenewalOpen
      ? { kind: 'subscribe', label: `Renew as ${plan.name}` }
      : {
          kind: 'none',
          label: 'Scheduled',
          title: s.pending_change_on
            ? `Starts ${formatDate(s.pending_change_on)}`
            : undefined,
        };
  }
  const higher =
    priceFor(plan, cycle) > (current ? priceFor(current, cycle) : 0);
  return {
    kind: 'change',
    label: higher ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`,
  };
}

/** Why the plan buttons are off: tells the user what to do instead. */
export function blockedReason(status: BillingStatus): string | undefined {
  if (status.can_buy) return undefined;
  if (status.renewal_opens_at) {
    return `Already paid until ${formatDate(status.current_period_end ?? status.renewal_opens_at)}. You can renew from ${formatDate(status.renewal_opens_at)}.`;
  }
  return 'Cancel your current subscription first';
}

/** The headline under the plan name, e.g. "Renews on 3 Dec 2026". */
export function periodLine(status: BillingStatus): string | null {
  if (!status.current_period_end) return null;
  const date = new Date(status.current_period_end).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (status.subscription_status === 'cancelled' || isGranted(status)) {
    return `Access until ${date}`;
  }
  if (status.billing_cycle === 'yearly') return `Paid until ${date}`;
  return `Renews on ${date}`;
}

// ── Razorpay Checkout (loaded on demand from Razorpay) ──────────────────────

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayOptions {
  key: string;
  name: string;
  description: string;
  image?: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  prefill?: { email?: string };
  theme?: { color: string; backdrop_color?: string };
  /** Keep the result in this page's handler; never navigate away. */
  redirect: boolean;
  retry?: { enabled: boolean; max_count?: number };
  timeout?: number;
  handler: (result: CheckoutResult) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    escape?: boolean;
    backdropclose?: boolean;
  };
}

interface PaymentFailure {
  error?: { description?: string };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (res: PaymentFailure) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** Brand blue (primary-600), also used by the dimmed backdrop. */
export const CHECKOUT_COLOR = '#1e4fd6';
const CHECKOUT_TIMEOUT_SECONDS = 15 * 60;

function loadCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('no window'));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment form'));
    document.body.appendChild(script);
  });
}

/** The options Razorpay Checkout opens with; pure so it can be tested. */
export function buildCheckoutOptions(
  checkout: CheckoutResponse,
  email: string,
  origin: string,
  onPaid: (result: CheckoutResult) => void,
  onDismiss: () => void
): RazorpayOptions {
  const common: RazorpayOptions = {
    key: checkout.key_id,
    name: 'reve8 Studio',
    description: `${checkout.plan_name} (${checkout.billing_cycle})`,
    // Razorpay fetches the logo itself, so it must be an absolute URL.
    image: `${origin}/icon.png`,
    prefill: { email },
    theme: { color: CHECKOUT_COLOR, backdrop_color: '#0b1220' },
    // Stay on this page on mobile and after bank authentication too.
    redirect: false,
    retry: { enabled: true, max_count: 3 },
    timeout: CHECKOUT_TIMEOUT_SECONDS,
    handler: onPaid,
    modal: {
      ondismiss: onDismiss,
      // Don't lose a half-finished payment to a stray click or Esc.
      confirm_close: true,
      escape: false,
      backdropclose: false,
    },
  };
  return checkout.kind === 'subscription'
    ? { ...common, subscription_id: checkout.razorpay_id }
    : {
        ...common,
        order_id: checkout.razorpay_id,
        amount: checkout.amount_inr * 100,
        currency: 'INR',
      };
}

/** Opens Razorpay Checkout for a checkout the backend created. */
export async function openCheckout(
  checkout: CheckoutResponse,
  email: string,
  onPaid: (result: CheckoutResult) => void,
  onDismiss: () => void,
  onFailed?: (message: string) => void
): Promise<void> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Could not load the payment form');
  const instance = new window.Razorpay(
    buildCheckoutOptions(
      checkout,
      email,
      window.location.origin,
      onPaid,
      onDismiss
    )
  );
  // Razorpay lets the customer retry inside the form; this only reports it.
  instance.on('payment.failed', (res) =>
    onFailed?.(res.error?.description ?? 'The payment did not go through.')
  );
  instance.open();
}

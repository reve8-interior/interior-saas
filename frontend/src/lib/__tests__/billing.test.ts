import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  buildCheckoutOptions,
  CHECKOUT_COLOR,
  cancelSubscription,
  isPaying,
  periodLine,
  startCheckout,
  statusLabel,
  syncPlanToRazorpay,
  verifyPayment,
} from '@/lib/billing';
import type { BillingStatus, CheckoutResponse } from '@/lib/schemas/billing';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const status = (changes: Partial<BillingStatus> = {}): BillingStatus => ({
  plan: 'solo',
  plan_name: 'Solo',
  billing_cycle: 'monthly',
  subscription_status: 'active',
  current_period_end: '2026-12-03T10:00:00Z',
  payments_enabled: true,
  first_month_offer_available: false,
  can_cancel: true,
  can_buy: false,
  renewal_opens_at: null,
  can_change_plan: false,
  pending_plan: null,
  pending_plan_name: null,
  pending_change_on: null,
  ...changes,
});

describe('statusLabel', () => {
  it('names known statuses and passes unknown ones through', () => {
    expect(statusLabel('halted')).toBe('Payment failed');
    expect(statusLabel('mystery')).toBe('mystery');
  });
});

describe('isPaying', () => {
  it('is true only for an active subscription', () => {
    expect(isPaying(status())).toBe(true);
    expect(isPaying(status({ subscription_status: 'cancelled' }))).toBe(false);
    expect(isPaying(status({ subscription_status: 'created' }))).toBe(false);
  });
});

describe('periodLine', () => {
  it('says renews for monthly, paid until for yearly, access until if cancelled', () => {
    expect(periodLine(status())).toMatch(/^Renews on .*2026/);
    expect(periodLine(status({ billing_cycle: 'yearly' }))).toMatch(
      /^Paid until/
    );
    expect(periodLine(status({ subscription_status: 'cancelled' }))).toMatch(
      /^Access until/
    );
  });

  it('is empty without a date', () => {
    expect(periodLine(status({ current_period_end: null }))).toBeNull();
  });
});

describe('billing api', () => {
  it('posts only the plan and cycle to checkout (never an amount)', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    await startCheckout({ plan_slug: 'solo', billing_cycle: 'yearly' });
    expect(api.post).toHaveBeenCalledWith('/billing/checkout', {
      plan_slug: 'solo',
      billing_cycle: 'yearly',
    });
  });

  it('sends the Checkout result for verification', async () => {
    vi.mocked(api.post).mockResolvedValue({ verified: true });
    const result = {
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
      razorpay_order_id: 'order_1',
    };
    await verifyPayment(result);
    expect(api.post).toHaveBeenCalledWith('/billing/verify', result);
  });

  it('cancels and syncs through the expected endpoints', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    await cancelSubscription();
    await syncPlanToRazorpay('p1');
    expect(api.post).toHaveBeenCalledWith('/billing/cancel', {});
    expect(api.post).toHaveBeenCalledWith('/admin/plans/p1/sync-razorpay', {});
  });
});

describe('buildCheckoutOptions', () => {
  const sub: CheckoutResponse = {
    kind: 'subscription',
    razorpay_id: 'sub_1',
    key_id: 'rzp_test_x',
    plan_name: 'Solo',
    billing_cycle: 'monthly',
    amount_inr: 499,
    first_month_offer: false,
  };
  const build = (c: CheckoutResponse) =>
    buildCheckoutOptions(
      c,
      'a@b.com',
      'https://app.reve8.in',
      vi.fn(),
      vi.fn()
    );

  it('stays in the page: no redirect, closing is guarded', () => {
    const o = build(sub);
    expect(o.redirect).toBe(false);
    expect(o.modal).toMatchObject({
      confirm_close: true,
      escape: false,
      backdropclose: false,
    });
    expect(o.retry?.enabled).toBe(true);
  });

  it('is branded with an absolute logo url and the brand colour', () => {
    const o = build(sub);
    expect(o.image).toBe('https://app.reve8.in/icon.png');
    expect(o.theme?.color).toBe(CHECKOUT_COLOR);
    expect(o.prefill?.email).toBe('a@b.com');
    expect(o.timeout).toBeGreaterThan(0);
  });

  it('uses the subscription id for subscriptions, with no amount', () => {
    const o = build(sub);
    expect(o.subscription_id).toBe('sub_1');
    expect(o.order_id).toBeUndefined();
    expect(o.amount).toBeUndefined();
  });

  it('uses the order id with the amount in paise for yearly orders', () => {
    const o = build({
      ...sub,
      kind: 'order',
      razorpay_id: 'order_1',
      billing_cycle: 'yearly',
      amount_inr: 9990,
    });
    expect(o.order_id).toBe('order_1');
    expect(o.amount).toBe(999000);
    expect(o.currency).toBe('INR');
    expect(o.subscription_id).toBeUndefined();
  });

  it('wires the paid and dismiss callbacks through', () => {
    const paid = vi.fn();
    const dismissed = vi.fn();
    const o = buildCheckoutOptions(sub, '', 'https://x', paid, dismissed);
    expect(o.handler).toBe(paid);
    expect(o.modal?.ondismiss).toBe(dismissed);
  });
});

describe('formatPaise and blockedReason', () => {
  it('formats paise as rupees with two decimals', async () => {
    const { formatPaise } = await import('@/lib/billing');
    expect(formatPaise(499000)).toBe('₹4,990.00');
    expect(formatPaise(49950)).toBe('₹499.50');
  });

  it('explains when renewal opens, or to cancel first, or nothing', async () => {
    const { blockedReason } = await import('@/lib/billing');
    expect(blockedReason(status({ can_buy: true }))).toBeUndefined();
    expect(
      blockedReason(
        status({
          can_buy: false,
          billing_cycle: 'yearly',
          renewal_opens_at: '2030-06-23T00:00:00Z',
          current_period_end: '2030-06-30T00:00:00Z',
        })
      )
    ).toContain('You can renew from');
    expect(blockedReason(status({ can_buy: false }))).toBe(
      'Cancel your current subscription first'
    );
  });
});

describe('planAction', () => {
  const plan = (slug: string, monthly: number, yearly: number) =>
    ({
      slug,
      name: slug[0].toUpperCase() + slug.slice(1),
      price_monthly_inr: monthly,
      price_yearly_inr: yearly,
    }) as never;
  const solo = plan('solo', 499, 4990);
  const studio = plan('studio', 999, 9990);
  const subscribed = (changes: Partial<BillingStatus> = {}) =>
    status({ plan: 'studio', can_change_plan: true, ...changes });

  it('lets a new customer simply choose', async () => {
    const { planAction } = await import('@/lib/billing');
    const free = status({
      plan: 'free',
      subscription_status: 'none',
      billing_cycle: null,
      can_buy: true,
    });
    expect(planAction(free, solo, undefined, 'monthly')).toEqual({
      kind: 'subscribe',
      label: 'Choose Solo',
    });
  });

  it('offers upgrade and downgrade relative to the current plan', async () => {
    const { planAction } = await import('@/lib/billing');
    const s = subscribed();
    const higher = plan('studio_pro', 2499, 24990);
    expect(planAction(s, higher, studio, 'monthly')).toMatchObject({
      kind: 'change',
      label: 'Upgrade to Studio_pro',
    });
    expect(planAction(s, solo, studio, 'monthly')).toMatchObject({
      kind: 'change',
      label: 'Downgrade to Solo',
    });
  });

  it('compares prices in the plan’s own billing cycle', async () => {
    const { planAction } = await import('@/lib/billing');
    const s = subscribed({ billing_cycle: 'yearly' });
    // Viewing "monthly" must not change the answer for a yearly customer.
    expect(planAction(s, solo, studio, 'monthly').label).toBe(
      'Downgrade to Solo'
    );
  });

  it('marks the current plan, and offers Resume after a cancellation', async () => {
    const { planAction } = await import('@/lib/billing');
    expect(planAction(subscribed(), studio, studio, 'monthly')).toMatchObject({
      kind: 'none',
      label: 'Current plan',
    });
    const cancelled = subscribed({ subscription_status: 'cancelled' });
    expect(planAction(cancelled, studio, studio, 'monthly')).toEqual({
      kind: 'change',
      label: 'Resume',
    });
  });

  it('lets a scheduled switch be undone and shows what is scheduled', async () => {
    const { planAction } = await import('@/lib/billing');
    const s = subscribed({
      pending_plan: 'solo',
      pending_plan_name: 'Solo',
      pending_change_on: '2030-06-30T00:00:00Z',
    });
    expect(planAction(s, studio, studio, 'monthly')).toEqual({
      kind: 'change',
      label: 'Keep Studio',
    });
    expect(planAction(s, solo, studio, 'monthly')).toMatchObject({
      kind: 'none',
      label: 'Scheduled',
    });
  });

  it('renews a yearly plan only once renewal is open', async () => {
    const { planAction } = await import('@/lib/billing');
    const closed = subscribed({
      billing_cycle: 'yearly',
      can_buy: false,
      renewal_opens_at: '2030-06-23T00:00:00Z',
    });
    expect(planAction(closed, studio, studio, 'yearly').kind).toBe('none');
    const open = subscribed({ billing_cycle: 'yearly', can_buy: true });
    expect(planAction(open, studio, studio, 'yearly')).toEqual({
      kind: 'subscribe',
      label: 'Renew',
    });
    const switching = subscribed({
      billing_cycle: 'yearly',
      can_buy: true,
      pending_plan: 'solo',
      pending_plan_name: 'Solo',
    });
    expect(planAction(switching, solo, studio, 'yearly')).toEqual({
      kind: 'subscribe',
      label: 'Renew as Solo',
    });
  });
});

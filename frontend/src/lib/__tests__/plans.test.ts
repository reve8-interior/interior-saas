import { describe, expect, it } from 'vitest';
import {
  formatInr,
  formatLimit,
  isPaidPlan,
  monthsFree,
  planLabel,
  yearlyPerMonth,
} from '@/lib/plans';
import {
  EMPTY_PLAN_FORM,
  planFormFor,
  planPayload,
  type PlanFormState,
} from '@/lib/planForm';
import type { AdminPlan, PublicPlan } from '@/lib/schemas/plan';

const publicPlan = (monthly: number | null, yearly: number | null) =>
  ({ price_monthly_inr: monthly, price_yearly_inr: yearly }) as PublicPlan;

describe('plan helpers', () => {
  it('labels slugs', () => {
    expect(planLabel('studio_pro')).toBe('Studio Pro');
    expect(planLabel('free')).toBe('Free');
  });

  it('treats everything but free as paid', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('solo')).toBe(true);
  });

  it('formats limits and prices', () => {
    expect(formatLimit(null)).toBe('Unlimited');
    expect(formatLimit(25)).toBe('25');
    expect(formatInr(24990)).toBe('₹24,990');
  });

  it('works out months free from the yearly price', () => {
    expect(monthsFree(publicPlan(999, 9990))).toBe(2);
    expect(monthsFree(publicPlan(499, 4990))).toBe(2);
    expect(monthsFree(publicPlan(null, null))).toBe(0);
    expect(monthsFree(publicPlan(999, 99999))).toBe(0);
  });

  it('shows the yearly price per month', () => {
    expect(yearlyPerMonth(publicPlan(999, 9990))).toBe(833);
    expect(yearlyPerMonth(publicPlan(0, null))).toBeNull();
  });
});

const form = (changes: Partial<PlanFormState>): PlanFormState => ({
  ...EMPTY_PLAN_FORM,
  slug: 'agency',
  name: 'Agency',
  ...changes,
});

describe('planPayload', () => {
  it('maps empty limits to null (unlimited)', () => {
    const result = planPayload(form({ max_users: '' }), false);
    expect(result.ok && result.payload.max_users).toBeNull();
  });

  it('parses whole numbers and trims highlights', () => {
    const result = planPayload(
      form({
        max_clients: '25',
        price_monthly_inr: '499',
        highlights: ' one \n\n two ',
      }),
      false
    );
    expect(result).toMatchObject({
      ok: true,
      payload: {
        max_clients: 25,
        price_monthly_inr: 499,
        highlights: ['one', 'two'],
      },
    });
  });

  it.each(['-1', '1.5', 'abc'])('rejects %s as a limit', (bad) => {
    expect(planPayload(form({ max_users: bad }), false).ok).toBe(false);
  });

  it('requires a name and a valid slug when creating', () => {
    expect(planPayload(form({ name: ' ' }), false).ok).toBe(false);
    expect(planPayload(form({ slug: 'Bad Slug' }), false).ok).toBe(false);
    expect(planPayload(form({ slug: '' }), true).ok).toBe(true);
  });

  it('limits image size to 1-100 MB', () => {
    expect(planPayload(form({ max_image_mb: '0' }), false).ok).toBe(false);
    expect(planPayload(form({ max_image_mb: '101' }), false).ok).toBe(false);
    expect(planPayload(form({ max_image_mb: '10' }), false).ok).toBe(true);
  });

  it('round-trips an existing plan', () => {
    const plan = {
      id: 'x',
      slug: 'solo',
      name: 'Solo',
      tagline: null,
      is_public: true,
      is_recommended: false,
      sort_order: 1,
      price_monthly_inr: 499,
      price_yearly_inr: 4990,
      max_users: 3,
      max_clients: null,
      max_quotation_versions: 10,
      max_images: 300,
      max_image_mb: 8,
      max_portfolio_designs: 50,
      ai_credits_monthly: 50,
      clean_export: true,
      branded_export: false,
      bulk_materials_import: false,
      priority_support: false,
      website_enabled: false,
      website_templates: 0,
      website_max_pages: 0,
      website_custom_domain: false,
      website_remove_badge: false,
      highlights: ['Email support'],
      razorpay_plan_id_monthly: null,
      razorpay_plan_price_inr: null,
    } satisfies AdminPlan;
    const result = planPayload(planFormFor(plan), true);
    expect(result).toMatchObject({
      ok: true,
      payload: {
        max_users: 3,
        max_clients: null,
        highlights: ['Email support'],
      },
    });
  });
});

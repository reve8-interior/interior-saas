import { api } from '@/lib/api';
import type { Plan } from '@/lib/schemas/auth';
import type {
  AdminPlan,
  PlanCreate,
  PlanUpdate,
  PublicPlan,
} from '@/lib/schemas/plan';

export function listAdminPlans(): Promise<AdminPlan[]> {
  return api.get<AdminPlan[]>('/admin/plans');
}

export function createPlan(body: PlanCreate): Promise<AdminPlan> {
  return api.post<AdminPlan>('/admin/plans', body);
}

export function updatePlan(id: string, body: PlanUpdate): Promise<AdminPlan> {
  return api.patch<AdminPlan>(`/admin/plans/${id}`, body);
}

export function getPricingVisibility(): Promise<{ show_pricing: boolean }> {
  return api.get<{ show_pricing: boolean }>('/admin/plans/visibility');
}

export function setPricingVisibility(
  show_pricing: boolean
): Promise<{ show_pricing: boolean }> {
  return api.put<{ show_pricing: boolean }>('/admin/plans/visibility', {
    show_pricing,
  });
}

export function deletePlan(id: string): Promise<void> {
  return api.delete<void>(`/admin/plans/${id}`);
}

/** "studio_pro" -> "Studio Pro". */
export function planLabel(slug: Plan): string {
  return slug
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Anything other than the free plan gets the highlighted pill. */
export function isPaidPlan(slug: Plan): boolean {
  return slug !== 'free';
}

/** "Unlimited" for a null limit, otherwise the number with separators. */
export function formatLimit(limit: number | null): string {
  return limit === null ? 'Unlimited' : limit.toLocaleString('en-IN');
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Whole months of the monthly price the yearly price saves (e.g. 2). */
export function monthsFree(plan: PublicPlan): number {
  const { price_monthly_inr: monthly, price_yearly_inr: yearly } = plan;
  if (!monthly || yearly === null) return 0;
  return Math.max(Math.round(12 - yearly / monthly), 0);
}

/** Yearly price per month, rounded to whole rupees. */
export function yearlyPerMonth(plan: PublicPlan): number | null {
  return plan.price_yearly_inr === null
    ? null
    : Math.round(plan.price_yearly_inr / 12);
}

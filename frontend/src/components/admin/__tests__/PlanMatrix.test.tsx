import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanMatrix } from '../PlanMatrix';
import type { AdminPlan } from '@/lib/schemas/plan';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const plan = (over: Partial<AdminPlan>): AdminPlan =>
  ({
    id: 'p1',
    slug: 'solo',
    name: 'Solo',
    price_monthly_inr: 499,
    razorpay_plan_id_monthly: null,
    razorpay_plan_price_inr: null,
    ...over,
  }) as AdminPlan;

function mount(plans: AdminPlan[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanMatrix plans={plans} onDelete={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('PlanMatrix Razorpay row', () => {
  it('is the first row of the table body', () => {
    const { container } = mount([plan({})]);
    const first = container.querySelector('tbody tr');
    expect(first?.textContent).toContain('Razorpay plan');
  });

  it('shows synced only when the id exists and the price matches', () => {
    mount([
      plan({
        id: 'a',
        slug: 'a',
        razorpay_plan_id_monthly: 'plan_1',
        razorpay_plan_price_inr: 499,
      }),
      plan({
        id: 'b',
        slug: 'b',
        razorpay_plan_id_monthly: 'plan_1',
        razorpay_plan_price_inr: 399,
      }),
      plan({ id: 'c', slug: 'c' }),
    ]);
    expect(screen.getAllByText('Synced')).toHaveLength(1);
    expect(screen.getAllByText('Not synced')).toHaveLength(2);
  });

  it('shows a dash and no sync button for a free plan', () => {
    mount([plan({ price_monthly_inr: null })]);
    expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

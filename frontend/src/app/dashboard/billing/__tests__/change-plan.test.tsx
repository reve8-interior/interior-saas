import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import BillingPage from '../page';
import * as billing from '@/lib/billing';
import { api } from '@/lib/api';
import type {
  BillingStatus,
  ChangePlanResponse,
  ChangeQuote,
} from '@/lib/schemas/billing';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock('@/lib/profile', () => ({
  getMe: vi.fn().mockResolvedValue({ role: 'admin', email: 'a@b.com' }),
}));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/billing', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing')>()),
  getBillingStatus: vi.fn(),
  getReceipts: vi.fn().mockResolvedValue([]),
  getChangeQuote: vi.fn(),
  changePlan: vi.fn(),
}));

const plan = (slug: string, name: string, monthly: number, yearly: number) => ({
  slug,
  name,
  tagline: null,
  is_recommended: false,
  price_monthly_inr: monthly,
  price_yearly_inr: yearly,
  max_users: 3,
  max_clients: 20,
  max_quotation_versions: 5,
  max_images: 100,
  max_portfolio_designs: 10,
  ai_credits_monthly: 20,
  clean_export: false,
  branded_export: false,
  bulk_materials_import: false,
  priority_support: false,
  website_enabled: false,
  website_custom_domain: false,
  website_remove_badge: false,
  highlights: [],
});
const plans = [
  plan('solo', 'Solo', 499, 4990),
  plan('studio', 'Studio', 999, 9990),
  plan('studio_pro', 'Studio Pro', 2499, 24990),
];

const onStudio: BillingStatus = {
  plan: 'studio',
  plan_name: 'Studio',
  billing_cycle: 'monthly',
  subscription_status: 'active',
  current_period_end: '2030-06-30T00:00:00Z',
  payments_enabled: true,
  first_month_offer_available: false,
  can_cancel: true,
  can_buy: false,
  renewal_opens_at: null,
  can_change_plan: true,
  pending_plan: null,
  pending_plan_name: null,
  pending_change_on: null,
};

const downgradeQuote: ChangeQuote = {
  direction: 'downgrade',
  effective: 'period_end',
  effective_on: '2030-06-30T00:00:00Z',
  amount_due_inr: 0,
  current_plan_name: 'Studio',
  target_plan_name: 'Solo',
  billing_cycle: 'monthly',
  summary: 'You keep Studio until 30 Jun 2030. Solo starts then.',
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingPage />
    </QueryClientProvider>
  );
}

describe('BillingPage plan changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(plans);
    vi.mocked(billing.getBillingStatus).mockResolvedValue(onStudio);
    vi.mocked(billing.getReceipts).mockResolvedValue([]);
  });

  it('shows upgrade and downgrade, not "Choose", to a subscriber', async () => {
    mount();
    expect(
      await screen.findByRole('button', { name: 'Upgrade to Studio Pro' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Downgrade to Solo' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Choose/ })).toBeNull();
    // No billing-period toggle: the change keeps the current cycle.
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows what a downgrade does before anything happens', async () => {
    vi.mocked(billing.getChangeQuote).mockResolvedValue(downgradeQuote);
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Downgrade to Solo' })
    );
    expect(await screen.findByText(/You keep Studio until/)).toBeTruthy();
    expect(billing.getChangeQuote).toHaveBeenCalledWith('solo');
    expect(billing.changePlan).not.toHaveBeenCalled();
  });

  it('shows the amount due for an upgrade', async () => {
    vi.mocked(billing.getChangeQuote).mockResolvedValue({
      ...downgradeQuote,
      direction: 'upgrade',
      effective: 'now',
      effective_on: null,
      amount_due_inr: 2499,
      target_plan_name: 'Studio Pro',
      summary: 'Studio Pro starts today.',
    });
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Upgrade to Studio Pro' })
    );
    expect(await screen.findByText('Due today')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Upgrade and pay ₹2499' })
    ).toBeTruthy();
  });

  it('schedules a yearly downgrade without opening a payment', async () => {
    vi.mocked(billing.getBillingStatus).mockResolvedValue({
      ...onStudio,
      billing_cycle: 'yearly',
    });
    vi.mocked(billing.getChangeQuote).mockResolvedValue({
      ...downgradeQuote,
      billing_cycle: 'yearly',
    });
    const scheduled: ChangePlanResponse = {
      mode: 'scheduled',
      checkout: null,
      message: 'Scheduled for 30 Jun 2030.',
      status: onStudio,
    };
    vi.mocked(billing.changePlan).mockResolvedValue(scheduled);
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Downgrade to Solo' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Schedule downgrade' })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Scheduled for 30 Jun 2030.')
    );
    expect(billing.changePlan).toHaveBeenCalledWith('solo');
  });

  it('reports a refused change inside the dialog', async () => {
    vi.mocked(billing.getChangeQuote).mockResolvedValue(downgradeQuote);
    vi.mocked(billing.changePlan).mockRejectedValue(
      new Error('Your plan renews in under an hour.')
    );
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Downgrade to Solo' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Schedule downgrade' })
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('explains a quote that cannot be made', async () => {
    vi.mocked(billing.getChangeQuote).mockRejectedValue(
      new Error('You are already on this plan.')
    );
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Downgrade to Solo' })
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('announces a scheduled switch and lets the customer keep their plan', async () => {
    vi.mocked(billing.getBillingStatus).mockResolvedValue({
      ...onStudio,
      pending_plan: 'solo',
      pending_plan_name: 'Solo',
      pending_change_on: '2030-06-30T00:00:00Z',
    });
    vi.mocked(billing.getChangeQuote).mockResolvedValue({
      ...downgradeQuote,
      direction: 'keep',
      effective: 'now',
      summary: 'You stay on Studio.',
    });
    mount();
    expect(await screen.findByText(/Switching to Solo on/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scheduled' })).toHaveProperty(
      'disabled',
      true
    );
    // Offered in the banner and on the plan card.
    const keep = screen.getAllByRole('button', { name: 'Keep Studio' });
    expect(keep).toHaveLength(2);
    fireEvent.click(keep[0]);
    expect(billing.getChangeQuote).toHaveBeenCalledWith('studio');
  });

  it('a customer with no plan still just chooses one', async () => {
    vi.mocked(billing.getBillingStatus).mockResolvedValue({
      ...onStudio,
      plan: 'free',
      plan_name: 'Free',
      billing_cycle: null,
      subscription_status: 'none',
      can_cancel: false,
      can_buy: true,
      can_change_plan: false,
    });
    mount();
    expect(
      (await screen.findAllByRole('button', { name: /^Choose/ })).length
    ).toBe(3);
    expect(screen.getByRole('tablist')).toBeTruthy();
  });
});

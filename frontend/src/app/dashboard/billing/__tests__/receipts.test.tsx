import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingPage from '../page';
import * as billing from '@/lib/billing';
import { api } from '@/lib/api';
import type { BillingStatus, Receipt } from '@/lib/schemas/billing';

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
  getReceipts: vi.fn(),
}));

const solo = {
  slug: 'solo',
  name: 'Solo',
  tagline: null,
  is_recommended: false,
  price_monthly_inr: 499,
  price_yearly_inr: 4990,
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
};

const paidUpYearly: BillingStatus = {
  plan: 'solo',
  plan_name: 'Solo',
  billing_cycle: 'yearly',
  subscription_status: 'active',
  current_period_end: '2030-06-30T00:00:00Z',
  payments_enabled: true,
  first_month_offer_available: false,
  can_cancel: false,
  can_buy: false,
  renewal_opens_at: '2030-06-23T00:00:00Z',
  can_change_plan: true,
  pending_plan: null,
  pending_plan_name: null,
  pending_change_on: null,
};

const receipt: Receipt = {
  id: 'r1',
  receipt_number: 'RV8-2030-000007',
  razorpay_payment_id: 'pay_123',
  paid_at: '2030-01-02T00:00:00Z',
  plan_name: 'Solo',
  billing_cycle: 'yearly',
  amount_paise: 499000,
  currency: 'INR',
  method: 'upi',
  period_start: '2030-01-02T00:00:00Z',
  period_end: '2031-01-02T00:00:00Z',
  billed_to: 'Acme Interiors',
  issuer_name: 'Reve8',
  issuer_address: '',
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingPage />
    </QueryClientProvider>
  );
}

describe('BillingPage paid-up plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue([solo]);
    vi.mocked(billing.getBillingStatus).mockResolvedValue(paidUpYearly);
    vi.mocked(billing.getReceipts).mockResolvedValue([]);
  });

  it('does not offer to pay again while the plan is paid up', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Current plan' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('title')).toContain('You can renew from');
    expect(screen.queryByRole('button', { name: 'Renew' })).toBeNull();
  });

  it('offers Renew once renewal is open', async () => {
    vi.mocked(billing.getBillingStatus).mockResolvedValue({
      ...paidUpYearly,
      can_buy: true,
      renewal_opens_at: null,
    });
    mount();
    const button = await screen.findByRole('button', { name: 'Renew' });
    expect(button).toHaveProperty('disabled', false);
  });
});

describe('BillingPage receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue([solo]);
    vi.mocked(billing.getBillingStatus).mockResolvedValue(paidUpYearly);
  });

  it('shows nothing before the first payment', async () => {
    vi.mocked(billing.getReceipts).mockResolvedValue([]);
    mount();
    await screen.findByText('Solo', { selector: 'h2' });
    expect(screen.queryByText('Receipts')).toBeNull();
  });

  it('lists receipts and opens one to print', async () => {
    vi.mocked(billing.getReceipts).mockResolvedValue([receipt]);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    mount();
    expect(await screen.findByText('RV8-2030-000007')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View receipt' }));
    expect(await screen.findByText('Acme Interiors')).toBeTruthy();
    expect(screen.getByText('₹4,990.00', { selector: 'dd' })).toBeTruthy();
    expect(screen.getByText(/not a GST tax invoice/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Print / Save as PDF' })
    );
    expect(print).toHaveBeenCalledTimes(1);
  });
});

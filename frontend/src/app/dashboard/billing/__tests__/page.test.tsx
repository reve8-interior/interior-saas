import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import BillingPage from '../page';
import * as billing from '@/lib/billing';
import type { BillingStatus } from '@/lib/schemas/billing';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock('@/lib/profile', () => ({
  getMe: vi.fn().mockResolvedValue({ role: 'admin', email: 'a@b.com' }),
}));
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/billing', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing')>()),
  getBillingStatus: vi.fn(),
  cancelSubscription: vi.fn(),
}));

const live: BillingStatus = {
  plan: 'solo',
  plan_name: 'Solo',
  billing_cycle: 'monthly',
  subscription_status: 'active',
  current_period_end: '2030-01-01T00:00:00Z',
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

describe('BillingPage cancel flow', () => {
  const nativeConfirm = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(billing.getBillingStatus).mockResolvedValue(live);
    vi.mocked(billing.cancelSubscription).mockResolvedValue({
      ...live,
      subscription_status: 'cancelled',
      can_cancel: false,
    });
    vi.stubGlobal('confirm', nativeConfirm);
  });

  async function openModal() {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
  }

  async function confirmCancel() {
    const buttons = await screen.findAllByRole('button', {
      name: 'Cancel subscription',
    });
    fireEvent.click(buttons[buttons.length - 1]);
  }

  it('asks in the app, never with the browser dialog', async () => {
    await openModal();
    expect(await screen.findByText('Cancel subscription?')).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(billing.cancelSubscription).not.toHaveBeenCalled();
  });

  it('keeping the subscription closes the modal and calls nothing', async () => {
    await openModal();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Keep subscription' })
    );
    await waitFor(() =>
      expect(screen.queryByText('Cancel subscription?')).toBeNull()
    );
    expect(billing.cancelSubscription).not.toHaveBeenCalled();
  });

  it('confirming cancels once and closes the modal', async () => {
    await openModal();
    await confirmCancel();
    await waitFor(() =>
      expect(billing.cancelSubscription).toHaveBeenCalledTimes(1)
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Cancel subscription?')).toBeNull()
    );
  });

  it('a failed cancel closes the modal and shows the error', async () => {
    vi.mocked(billing.cancelSubscription).mockRejectedValue(
      new Error('provider down')
    );
    await openModal();
    await confirmCancel();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Cancel subscription?')).toBeNull()
    );
  });

  it('offers no cancel button when there is nothing to cancel', async () => {
    vi.mocked(billing.getBillingStatus).mockResolvedValue({
      ...live,
      can_cancel: false,
    });
    mount();
    await screen.findByText('Solo');
    expect(
      screen.queryByRole('button', { name: 'Cancel subscription' })
    ).toBeNull();
  });
});

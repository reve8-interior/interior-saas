import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminOverview } from '@/lib/adminMonitor';
import { listBusinesses, resendBusinessInvite } from '@/lib/businesses';
import type { Business } from '@/lib/schemas/business';
import BusinessDetailPage from '../page';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'b1' }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/adminMonitor', () => ({ getAdminOverview: vi.fn() }));
vi.mock('@/lib/businesses', () => ({
  listBusinesses: vi.fn(),
  setBusinessActive: vi.fn(),
  resendBusinessInvite: vi.fn(),
}));
vi.mock('@/components/admin/BusinessDetailTabs', () => ({
  default: () => null,
}));
vi.mock('@/components/admin/BusinessFormModal', () => ({
  BusinessFormModal: () => null,
}));
vi.mock('@/components/admin/AccessBadge', () => ({
  AccessBadge: () => null,
  StatusBadge: () => null,
}));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessDetailPage />
    </QueryClientProvider>
  );
}

const resendButton = () =>
  screen.findByRole('button', { name: /resend invite/i });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminOverview).mockResolvedValue({
    businesses: [{ id: 'b1', name: 'Fresh Studio', is_active: true }],
  } as Awaited<ReturnType<typeof getAdminOverview>>);
  vi.mocked(listBusinesses).mockResolvedValue([
    {
      id: 'b1',
      name: 'Fresh Studio',
      is_active: true,
      contact_email: 'owner@fresh.com',
      contact_phone: null,
    } as Business,
  ]);
});

describe('business page: Resend invite', () => {
  it('shows the button next to Edit and Deactivate', async () => {
    mount();
    expect(await resendButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /deactivate/i })
    ).toBeInTheDocument();
  });

  it('re-sends for this business and confirms the address', async () => {
    vi.mocked(resendBusinessInvite).mockResolvedValue({
      invite_sent: true,
      email: 'owner@fresh.com',
    });
    mount();
    fireEvent.click(await resendButton());

    await waitFor(() =>
      expect(resendBusinessInvite).toHaveBeenCalledWith('b1')
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Invite emailed to owner@fresh.com'
      )
    );
    expect(
      screen.queryByText('Share these sign-in details')
    ).not.toBeInTheDocument();
  });

  it('shows a one-time password when email is not configured', async () => {
    vi.mocked(resendBusinessInvite).mockResolvedValue({
      invite_sent: false,
      temporary_password: 'Tmp9Pass2x',
      email: 'owner@fresh.com',
    });
    mount();
    fireEvent.click(await resendButton());

    expect(
      await screen.findByText('Share these sign-in details')
    ).toBeInTheDocument();
    expect(screen.getByText('Tmp9Pass2x')).toBeInTheDocument();
    expect(screen.getByText('Tmp9Pass2x').closest('dl')).toHaveTextContent(
      'owner@fresh.com'
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('tells the admin when the owner has already set up', async () => {
    vi.mocked(resendBusinessInvite).mockRejectedValue(
      new Error('The admin has already set up their account.')
    );
    mount();
    fireEvent.click(await resendButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The admin has already set up their account.'
      )
    );
    expect(
      screen.queryByText('Share these sign-in details')
    ).not.toBeInTheDocument();
  });

  it('disables the button and shows progress while sending', async () => {
    let finish: (v: { invite_sent: boolean; email: string }) => void = () => {};
    vi.mocked(resendBusinessInvite).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    mount();
    fireEvent.click(await resendButton());
    expect(
      await screen.findByRole('button', { name: /sending/i })
    ).toBeDisabled();
    finish({ invite_sent: true, email: 'owner@fresh.com' });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(await resendButton()).toBeEnabled();
  });

  it('does not offer the button until the business record has loaded', async () => {
    vi.mocked(listBusinesses).mockResolvedValue([]);
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Fresh Studio' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /resend invite/i })
    ).not.toBeInTheDocument();
  });
});

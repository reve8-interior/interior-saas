import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBusiness, updateBusiness } from '@/lib/businesses';
import { getMe } from '@/lib/profile';
import type { Business } from '@/lib/schemas/business';
import { BusinessFormModal } from '../BusinessFormModal';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock('@/lib/profile', () => ({ getMe: vi.fn() }));
vi.mock('@/lib/plans', () => ({
  listAdminPlans: vi.fn().mockResolvedValue([{ slug: 'free', name: 'Free' }]),
}));
vi.mock('@/lib/businesses', () => ({
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));

const created = (over: Partial<Business> = {}) =>
  ({
    id: 'b1',
    name: 'Fresh Studio',
    invite_sent: false,
    temporary_password: null,
    ...over,
  }) as Business;

const invitesEnabled = (enabled: boolean) =>
  vi.mocked(getMe).mockResolvedValue({
    role: 'superadmin',
    email: 'root@reve8.com',
    invites_enabled: enabled,
  } as Awaited<ReturnType<typeof getMe>>);

function mount(business: Business | null = null) {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BusinessFormModal open business={business} onClose={onClose} />
    </QueryClientProvider>
  );
  return { onClose };
}

const adminEmailInput = () =>
  document.querySelector<HTMLInputElement>('input[type="email"]')!;
const nameInput = () => screen.getAllByRole('textbox')[0];

function fillAndSubmit(name: string, adminEmail: string, label: RegExp) {
  fireEvent.change(nameInput(), { target: { value: name } });
  fireEvent.change(adminEmailInput(), { target: { value: adminEmail } });
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  invitesEnabled(true);
});

describe('BusinessFormModal (add)', () => {
  it('has no password field: the admin sets their own from the email', () => {
    mount();
    expect(
      screen.queryByLabelText(/temporary password/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).toBeNull();
    expect(screen.getByText(/email them a link/i)).toBeInTheDocument();
  });

  it('says "Add business & send invite" when email is configured', async () => {
    mount();
    expect(
      await screen.findByRole('button', { name: 'Add business & send invite' })
    ).toBeInTheDocument();
  });

  it('says plain "Add business" when email is not configured', async () => {
    invitesEnabled(false);
    mount();
    expect(
      await screen.findByRole('button', { name: 'Add business' })
    ).toBeInTheDocument();
  });

  it('creates the business without a password and closes after the invite', async () => {
    vi.mocked(createBusiness).mockResolvedValue(created({ invite_sent: true }));
    const { onClose } = mount();
    await screen.findByRole('button', { name: 'Add business & send invite' });
    fillAndSubmit('Fresh Studio', ' owner@fresh.com ', /send invite/i);

    await waitFor(() => expect(createBusiness).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createBusiness).mock.calls[0][0];
    expect(body.name).toBe('Fresh Studio');
    expect(body.admin_email).toBe('owner@fresh.com');
    expect(body).not.toHaveProperty('admin_password');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Business added. Invite emailed to owner@fresh.com'
      )
    );
    expect(onClose).toHaveBeenCalled();
    expect(
      screen.queryByText('Share these sign-in details')
    ).not.toBeInTheDocument();
  });

  it('shows a generated password once, then closes, when email is off', async () => {
    invitesEnabled(false);
    vi.mocked(createBusiness).mockResolvedValue(
      created({ temporary_password: 'Gen3ratedPw' })
    );
    const { onClose } = mount();
    await screen.findByRole('button', { name: 'Add business' });
    fillAndSubmit('Fresh Studio', 'owner@fresh.com', /^add business$/i);

    expect(
      await screen.findByText('Share these sign-in details')
    ).toBeInTheDocument();
    expect(screen.getByText('Gen3ratedPw')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires a business name and an admin email', async () => {
    mount();
    await screen.findByRole('button', { name: 'Add business & send invite' });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));
    expect(toast.error).toHaveBeenCalledWith('Business name is required');

    fireEvent.change(nameInput(), { target: { value: 'Fresh Studio' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));
    expect(toast.error).toHaveBeenCalledWith('Admin email is required');
    expect(createBusiness).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows the error when the invite fails', async () => {
    vi.mocked(createBusiness).mockRejectedValue(
      new Error('Could not send the invite email.')
    );
    const { onClose } = mount();
    await screen.findByRole('button', { name: 'Add business & send invite' });
    fillAndSubmit('Fresh Studio', 'owner@fresh.com', /send invite/i);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not send the invite email.'
      )
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BusinessFormModal (edit)', () => {
  const existing = {
    id: 'b1',
    name: 'Old Name',
    contact_email: 'hi@old.com',
    contact_phone: null,
    plan: 'free',
    plan_name: 'Free',
    warning_days: 7,
    ai_credit_bonus: 0,
    access_expires_at: null,
    seats_used: 1,
    image_count: 0,
  } as unknown as Business;

  it('shows no admin or invite fields and keeps the Save label', async () => {
    mount(existing);
    expect(
      await screen.findByRole('button', { name: 'Save changes' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/invite link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/admin email/i)).not.toBeInTheDocument();
  });

  it('updates without opening the credentials modal', async () => {
    vi.mocked(updateBusiness).mockResolvedValue(created());
    const { onClose } = mount(existing);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => expect(updateBusiness).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Business updated');
  });
});

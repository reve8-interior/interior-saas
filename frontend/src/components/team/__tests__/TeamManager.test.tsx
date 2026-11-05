import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMe } from '@/lib/profile';
import type { BusinessUser, TeamOverview } from '@/lib/schemas/business';
import type { TeamApi } from '@/lib/team';
import { TeamManager } from '../TeamManager';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock('@/lib/profile', () => ({ getMe: vi.fn() }));
vi.mock('@/components/team/MemberClientsEditor', () => ({
  MemberClientsEditor: () => null,
}));
vi.mock('@/components/team/ActivityLog', () => ({ ActivityLog: () => null }));

const member = (over: Partial<BusinessUser> = {}): BusinessUser => ({
  id: 'u1',
  email: 'priya@studio.com',
  full_name: 'Priya',
  role: 'designer',
  is_active: true,
  must_change_password: false,
  invite_pending: false,
  last_login_at: '2026-11-01T10:00:00Z',
  created_at: '2026-10-01T10:00:00Z',
  ...over,
});

function makeApi(members: BusinessUser[] = [member()]): TeamApi {
  const overview: TeamOverview = {
    members,
    seats_used: members.length,
    max_users: null,
    seats_left: null,
  };
  return {
    key: ['team', 'test'],
    overview: vi.fn().mockResolvedValue(overview),
    add: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    remove: vi.fn(),
    audit: vi.fn(),
  };
}

function mount(api: TeamApi) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TeamManager api={api} selfId="me" />
    </QueryClientProvider>
  );
}

const invitesEnabled = (enabled: boolean) =>
  vi.mocked(getMe).mockResolvedValue({
    role: 'admin',
    email: 'me@studio.com',
    invites_enabled: enabled,
  } as Awaited<ReturnType<typeof getMe>>);

async function openAddForm() {
  fireEvent.click(await screen.findByRole('button', { name: /add member/i }));
  return screen.findByLabelText(/login email/i);
}

function typeEmail(value: string) {
  fireEvent.change(screen.getByLabelText(/login email/i), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  invitesEnabled(true);
});

describe('TeamManager add member', () => {
  it('has no password field: people set their own via the invite', async () => {
    mount(makeApi());
    await openAddForm();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/email them a link/i)).toBeInTheDocument();
  });

  it('labels the submit button "Send invite" when email is configured', async () => {
    mount(makeApi());
    await openAddForm();
    expect(
      await screen.findByRole('button', { name: 'Send invite' })
    ).toBeInTheDocument();
  });

  it('keeps the plain "Save" label when email is not configured', async () => {
    invitesEnabled(false);
    mount(makeApi());
    await openAddForm();
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send invite' })
    ).not.toBeInTheDocument();
  });

  it('sends no password and confirms with a toast when an invite goes out', async () => {
    const api = makeApi();
    vi.mocked(api.add).mockResolvedValue({
      ...member({ id: 'u2', email: 'new@studio.com' }),
      invite_sent: true,
      temporary_password: null,
    });
    mount(api);
    await openAddForm();
    typeEmail(' new@studio.com ');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith({
        email: 'new@studio.com',
        full_name: null,
        role: 'designer',
      })
    );
    const body = vi.mocked(api.add).mock.calls[0][0];
    expect(body).not.toHaveProperty('password');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Invite emailed to new@studio.com'
      )
    );
    expect(
      screen.queryByText('Share these sign-in details')
    ).not.toBeInTheDocument();
  });

  it('shows a generated password once when no email is configured', async () => {
    invitesEnabled(false);
    const api = makeApi();
    vi.mocked(api.add).mockResolvedValue({
      ...member({ id: 'u2', email: 'new@studio.com' }),
      invite_sent: false,
      temporary_password: 'Gen3ratedPw',
    });
    mount(api);
    await openAddForm();
    typeEmail('new@studio.com');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Share these sign-in details')
    ).toBeInTheDocument();
    expect(screen.getByText('Gen3ratedPw')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Member added');
  });

  it('blocks an invalid email before calling the API', async () => {
    const api = makeApi();
    mount(api);
    await openAddForm();
    typeEmail('not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('shows the server message when the invite cannot be sent', async () => {
    const api = makeApi();
    vi.mocked(api.add).mockRejectedValue(
      new Error('Could not send the invite email.')
    );
    mount(api);
    await openAddForm();
    typeEmail('new@studio.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not send the invite email.'
      )
    );
  });
});

describe('TeamManager pending invites', () => {
  const pending = member({
    id: 'u9',
    email: 'wait@studio.com',
    full_name: 'Waiting',
    must_change_password: true,
    invite_pending: true,
    last_login_at: null,
  });

  async function openMenu(name: string) {
    fireEvent.click(
      await screen.findByRole('button', { name: `More actions for ${name}` })
    );
  }

  it('marks a member whose invite is still pending', async () => {
    mount(makeApi([pending]));
    expect(await screen.findByText(/invite pending/i)).toBeInTheDocument();
    expect(screen.queryByText(/temp password/i)).not.toBeInTheDocument();
  });

  it('still marks a hand-over temporary password as such', async () => {
    mount(
      makeApi([member({ must_change_password: true, invite_pending: false })])
    );
    expect(await screen.findByText(/temp password/i)).toBeInTheDocument();
  });

  it('offers "Resend invite" for a pending member and "Reset password" otherwise', async () => {
    mount(makeApi([pending, member()]));
    await openMenu('Waiting');
    expect(
      screen.getByRole('menuitem', { name: 'Resend invite' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Reset password' })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await openMenu('Priya');
    expect(
      screen.getByRole('menuitem', { name: 'Reset password' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Resend invite' })
    ).not.toBeInTheDocument();
  });

  it('resending emails a fresh invite and shows no password', async () => {
    const api = makeApi([pending]);
    vi.mocked(api.resetPassword).mockResolvedValue({
      invite_sent: true,
      temporary_password: null,
    });
    mount(api);
    await openMenu('Waiting');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resend invite' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith('u9'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Invite emailed to wait@studio.com'
      )
    );
    expect(
      screen.queryByText('Share these sign-in details')
    ).not.toBeInTheDocument();
  });

  it('a reset without email shows the temporary password once', async () => {
    invitesEnabled(false);
    const api = makeApi([member()]);
    vi.mocked(api.resetPassword).mockResolvedValue({
      invite_sent: false,
      temporary_password: 'Tmp9Pass2x',
    });
    mount(api);
    await openMenu('Priya');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

    expect(await screen.findByText('Tmp9Pass2x')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

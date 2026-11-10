import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientsPage from '../page';
import { api } from '@/lib/api';
import type { Client } from '@/lib/schemas/client';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/clients',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('@/components/layout/TopBarActions', () => ({
  TopBarActions: () => null,
}));
vi.mock('@/components/crm/NewClientModal', () => ({
  NewClientModal: () => null,
}));
vi.mock('@/components/crm/ClientsViewSwitch', () => ({
  ClientsViewSwitch: () => null,
}));

const client = (id: string, name: string, locked?: boolean): Client =>
  ({
    id,
    name,
    current_phase: 'design',
    contact_info: { phone: '99999' },
    assigned_designer_id: null,
    assigned_designer: null,
    notes: null,
    is_active: true,
    is_sample: false,
    locked,
    created_at: '2030-01-01T00:00:00Z',
    updated_at: '2030-01-01T00:00:00Z',
    completed_at: null,
  }) as Client;

function renderPage(list: Client[]) {
  vi.mocked(api.get).mockResolvedValue(list);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientsPage />
    </QueryClientProvider>
  );
}

describe('Clients list: locked clients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows no lock badge when nothing is locked', async () => {
    renderPage([client('1', 'Alpha'), client('2', 'Beta')]);
    await screen.findAllByText('Alpha');
    expect(screen.queryByText(/Locked/)).toBeNull();
  });

  it('badges only the locked client with an upgrade hint', async () => {
    renderPage([client('1', 'Alpha'), client('2', 'Beta', true)]);
    await screen.findAllByText('Alpha');
    // Rendered once for phones and once for the desktop table.
    expect(screen.getAllByText(/Locked · Upgrade to unlock/).length).toBe(2);
  });

  it('treats an explicit locked:false like an open client', async () => {
    renderPage([client('1', 'Alpha', false)]);
    await screen.findAllByText('Alpha');
    expect(screen.queryByText(/Locked/)).toBeNull();
  });

  it('keeps the locked client clickable so the lock card can explain', async () => {
    renderPage([client('2', 'Beta', true)]);
    const links = await screen.findAllByRole('link', { name: /Beta/ });
    expect(
      links.some((l) => l.getAttribute('href') === '/dashboard/clients/2')
    ).toBe(true);
  });
});

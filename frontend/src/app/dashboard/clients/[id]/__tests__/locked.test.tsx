import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientWorkspaceLayout from '../layout';
import { api } from '@/lib/api';
import type { Client } from '@/lib/schemas/client';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c9' }),
  usePathname: () => '/dashboard/clients/c9',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/designs', () => ({
  countDesigns: vi.fn().mockResolvedValue(0),
  designCountKey: (id: string) => ['design-count', id],
}));
vi.mock('@/lib/attention', () => ({
  ATTENTION_KEY: ['attention'],
  getAttention: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/profile', () => ({
  getMe: vi.fn().mockResolvedValue({ ai: { enabled: false } }),
}));
vi.mock('@/lib/quotationVersions', () => ({
  listQuotationVersions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/components/quotation/OpenQuestionStrip', () => ({
  OpenQuestionStrip: () => null,
}));
vi.mock('@/components/quotation/QuotationSections', () => ({
  QuotationSections: () => null,
}));

const client = (over: Partial<Client> = {}): Client =>
  ({
    id: 'c9',
    name: 'Mrs Rao',
    current_phase: 'design',
    contact_info: {},
    assigned_designer_id: null,
    assigned_designer: null,
    notes: null,
    is_active: true,
    is_sample: false,
    created_at: '2030-01-01T00:00:00Z',
    updated_at: '2030-01-01T00:00:00Z',
    completed_at: null,
    ...over,
  }) as Client;

function renderLayout(c: Client) {
  vi.mocked(api.get).mockImplementation(async (url: string) =>
    url === '/clients/c9' ? c : []
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientWorkspaceLayout>
        <p>workspace content</p>
      </ClientWorkspaceLayout>
    </QueryClientProvider>
  );
}

describe('Client workspace: locked client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no ResizeObserver; the tab strip observes its size.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  it('replaces the workspace with an upgrade card', async () => {
    renderLayout(client({ locked: true }));
    expect(await screen.findByText(/Mrs Rao is locked/)).toBeTruthy();
    expect(screen.queryByText('workspace content')).toBeNull();
  });

  it('reassures that data is safe and offers an archive route', async () => {
    renderLayout(client({ locked: true }));
    await screen.findByText(/is locked/);
    expect(screen.getByText(/Your data is safe/)).toBeTruthy();
    expect(screen.getByText(/archive another client/i)).toBeTruthy();
  });

  it('links to billing and back to the client list', async () => {
    renderLayout(client({ locked: true }));
    const upgrade = await screen.findByRole('link', {
      name: /upgrade to unlock/i,
    });
    expect(upgrade.getAttribute('href')).toBe('/dashboard/billing');
    const back = screen.getByRole('link', { name: /back to clients/i });
    expect(back.getAttribute('href')).toBe('/dashboard/clients');
  });

  it('hides the section tabs while locked', async () => {
    renderLayout(client({ locked: true }));
    await screen.findByText(/is locked/);
    expect(
      screen.queryByRole('navigation', { name: /client sections/i })
    ).toBeNull();
  });

  it('shows the normal workspace for an open client', async () => {
    renderLayout(client({ locked: false }));
    expect(await screen.findByText('workspace content')).toBeTruthy();
    expect(screen.queryByText(/is locked/)).toBeNull();
    expect(
      screen.getByRole('navigation', { name: /client sections/i })
    ).toBeTruthy();
  });

  it('treats a missing locked flag as open', async () => {
    renderLayout(client());
    expect(await screen.findByText('workspace content')).toBeTruthy();
    expect(screen.queryByText(/is locked/)).toBeNull();
  });
});

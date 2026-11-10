import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioPage from '../page';
import * as designs from '@/lib/designs';
import type { PortfolioDesign } from '@/lib/schemas/design';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/TopBarActions', () => ({
  TopBarActions: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/components/designs/PortfolioShareModal', () => ({
  PortfolioShareModal: ({ designIds }: { designIds: string[] }) => (
    <div data-testid="share-modal">{designIds.join(',')}</div>
  ),
}));
vi.mock('@/components/designs/AddToPortfolioModal', () => ({
  AddToPortfolioModal: () => null,
}));
vi.mock('@/lib/designs', async (orig) => ({
  ...(await orig<typeof import('@/lib/designs')>()),
  listPortfolioDesigns: vi.fn(),
  setPortfolioOrder: vi.fn(),
  setDesignInPortfolio: vi.fn(),
}));

const design = (id: string, locked = false): PortfolioDesign =>
  ({
    id,
    client_id: 'c1',
    client_name: 'Mrs Rao',
    title: `Design ${id}`,
    description: null,
    image_url: `https://img/${id}.png`,
    thumb_url: null,
    rooms: [],
    hotspots: [],
    in_portfolio: true,
    locked,
  }) as unknown as PortfolioDesign;

function renderPage(list: PortfolioDesign[]) {
  vi.mocked(designs.listPortfolioDesigns).mockResolvedValue(list);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortfolioPage />
    </QueryClientProvider>
  );
}

describe('Portfolio page: designs over the plan limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows no lock UI when nothing is over the limit', async () => {
    renderPage([design('a'), design('b')]);
    await screen.findByText('Design a');
    expect(screen.queryByText(/Locked/)).toBeNull();
    expect(screen.queryByText(/portfolio designs? (is|are)/i)).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('badges each locked design and removes its select checkbox', async () => {
    renderPage([design('a'), design('b', true), design('c', true)]);
    await screen.findByText('Design a');
    expect(screen.getAllByText(/Locked · Upgrade to unlock/)).toHaveLength(2);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByLabelText(/Select Design b to share/)).toBeNull();
  });

  it('explains how many are locked, with a link to billing (plural)', async () => {
    renderPage([design('a'), design('b', true), design('c', true)]);
    await screen.findByText('Design a');
    expect(screen.getByText(/2 portfolio designs are/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /upgrade to unlock/i });
    expect(link.getAttribute('href')).toBe('/dashboard/billing');
  });

  it('uses the singular for exactly one locked design', async () => {
    renderPage([design('a'), design('b', true)]);
    await screen.findByText('Design a');
    expect(screen.getByText(/1 portfolio design is/i)).toBeTruthy();
  });

  it('handles every design being locked', async () => {
    renderPage([design('a', true), design('b', true)]);
    await screen.findByText('Design a');
    expect(screen.getByText(/2 portfolio designs are/i)).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('shares only open designs when nothing is ticked', async () => {
    renderPage([design('a'), design('b', true), design('c')]);
    await screen.findByText('Design a');
    fireEvent.click(screen.getByRole('button', { name: /share portfolio/i }));
    expect(screen.getByTestId('share-modal').textContent).toBe('a,c');
  });

  it('"Select all" ticks open designs only', async () => {
    renderPage([design('a'), design('b', true), design('c')]);
    await screen.findByText('Design a');
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /share \(2\)/i }));
    expect(screen.getByTestId('share-modal').textContent).toBe('a,c');
  });

  it('offers "Clear" once every open design is ticked, locked ones aside', async () => {
    renderPage([design('a'), design('b', true)]);
    await screen.findByText('Design a');
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeTruthy();
  });

  it('keeps the locked card readable (title and client link remain)', async () => {
    renderPage([design('a'), design('b', true)]);
    const title = await screen.findByText('Design b');
    const card = title.closest('div.surface') as HTMLElement;
    expect(within(card).getByText(/Mrs Rao/)).toBeTruthy();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  QuotationShare,
  QuotationVersionSummary,
} from '@/lib/schemas/quotationVersion';
import { ShareModal } from '../ShareModal';

const listVersionShares = vi.fn();
const listVersions = vi.fn();
vi.mock('@/lib/quotationVersions', () => ({
  createVersionShare: vi.fn(),
  listQuotationVersions: (...a: unknown[]) => listVersions(...a),
  moveShareLink: vi.fn(),
  listVersionShares: (...a: unknown[]) => listVersionShares(...a),
  revokeVersionShare: vi.fn(),
  updateVersionShareExpiry: vi.fn(),
}));

const version = {
  id: 'v1',
  number: 1,
  room_designs: {},
  line_items: [],
  is_active: true,
  is_sample: false,
} as unknown as QuotationVersionSummary;

const share = (over: Partial<QuotationShare> = {}): QuotationShare => ({
  id: 's1',
  version_id: 'v1',
  url: 'https://x.test/quotation/abc',
  show_prices: false,
  expires_at: null,
  revoked_at: null,
  created_at: '2030-01-01T00:00:00Z',
  view_count: 0,
  last_viewed_at: null,
  response_kind: null,
  response_name: null,
  response_message: null,
  responded_at: null,
  ...over,
});

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShareModal clientId="c1" version={version} open onClose={() => {}} />
    </QueryClientProvider>
  );

describe('ShareModal', () => {
  beforeEach(() => listVersions.mockResolvedValue([]));

  it('says there is no link yet when nothing is shared', async () => {
    listVersionShares.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText('No link yet.')).toBeInTheDocument();
  });

  it('shows an active link as on and not yet opened', async () => {
    listVersionShares.mockResolvedValue([share()]);
    renderTab();
    expect(await screen.findByText('Link is on')).toBeInTheDocument();
    expect(screen.getByText('Not opened yet')).toBeInTheDocument();
  });

  it('labels an expired link as expired', async () => {
    listVersionShares.mockResolvedValue([
      share({ expires_at: '2000-01-01T00:00:00Z' }),
    ]);
    renderTab();
    expect(await screen.findByText('Link expired')).toBeInTheDocument();
  });

  it('offers to move the existing link instead of creating a second one', async () => {
    listVersionShares.mockResolvedValue([]);
    listVersions.mockResolvedValue([{ id: 'v0', number: 1, is_shared: true }]);
    listVersionShares.mockImplementation((id: string) =>
      Promise.resolve(id === 'v0' ? [share()] : [])
    );
    renderTab();
    expect(
      await screen.findByText('Your customer already has a link')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /on this link/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Create link and copy')).toBeNull();
    expect(
      await screen.findByText('https://x.test/quotation/abc')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Copy link/ })
    ).toBeInTheDocument();
  });
});

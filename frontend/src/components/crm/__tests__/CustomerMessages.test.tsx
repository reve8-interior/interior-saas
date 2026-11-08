import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerMessages } from '../CustomerMessages';
import { api } from '@/lib/api';
import {
  listQuotationMessages,
  resolveQuotationMessage,
  type QuotationMessage,
} from '@/lib/quotationMessages';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/quotationMessages', async (orig) => ({
  ...(await orig<typeof import('@/lib/quotationMessages')>()),
  listQuotationMessages: vi.fn(),
  resolveQuotationMessage: vi.fn().mockResolvedValue({}),
}));

const msg = (over: Partial<QuotationMessage>): QuotationMessage => ({
  id: 'm1',
  version_id: 'v1',
  version_number: 2,
  kind: 'question',
  name: 'Mrs Rao',
  message: 'Which finish?',
  item_label: null,
  created_at: '2026-11-01T10:00:00Z',
  resolved_at: null,
  resolved_by_name: null,
  ...over,
});

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CustomerMessages clientId="c1" />
    </QueryClientProvider>
  );

describe('CustomerMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({
      contact_info: { phone: '+91 98765 43210' },
    });
  });

  it('shows only the open questions', async () => {
    vi.mocked(listQuotationMessages).mockResolvedValue([
      msg({ id: 'open', message: 'Still open' }),
      msg({
        id: 'done',
        message: 'Already answered',
        resolved_at: '2026-11-02T00:00:00Z',
      }),
      msg({ id: 'ok', kind: 'approved', message: 'Looks good' }),
    ]);
    renderIt();
    expect(await screen.findByText('Still open')).toBeInTheDocument();
    expect(screen.queryByText('Already answered')).toBeNull();
    expect(screen.queryByText('Looks good')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('1 open');
  });

  it('renders nothing when no question is waiting', async () => {
    vi.mocked(listQuotationMessages).mockResolvedValue([
      msg({ resolved_at: '2026-11-02T00:00:00Z' }),
      msg({ id: 'ok', kind: 'approved', message: null }),
    ]);
    const { container } = renderIt();
    await waitFor(() => expect(listQuotationMessages).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('links to this customer in the inbox', async () => {
    vi.mocked(listQuotationMessages).mockResolvedValue([msg({})]);
    renderIt();
    expect(
      await screen.findByRole('link', { name: 'Open in inbox' })
    ).toHaveAttribute('href', '/dashboard/inbox?client=c1');
  });

  it('shows which line a question is about and edits that line', async () => {
    vi.mocked(listQuotationMessages).mockResolvedValue([
      msg({ item_label: 'Hall · TV unit' }),
    ]);
    renderIt();
    expect(
      await screen.findByText('About: Hall · TV unit')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Edit quotation/ })
    ).toHaveAttribute(
      'href',
      `/dashboard/clients/c1/quotation?line=${encodeURIComponent('Hall · TV unit')}`
    );
  });

  it('marks a question resolved', async () => {
    vi.mocked(listQuotationMessages).mockResolvedValue([msg({ id: 'q9' })]);
    renderIt();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark resolved' })
    );
    await waitFor(() =>
      expect(resolveQuotationMessage).toHaveBeenCalledWith('q9', true)
    );
  });
});

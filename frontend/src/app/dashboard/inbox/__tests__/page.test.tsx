import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InboxPage from '../page';
import { getInbox, type InboxMessage } from '@/lib/inbox';
import { resolveQuotationMessage } from '@/lib/quotationMessages';

const replace = vi.fn();
let clientParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: () => clientParam }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/inbox', async (orig) => ({
  ...(await orig<typeof import('@/lib/inbox')>()),
  getInbox: vi.fn(),
}));
vi.mock('@/lib/quotationMessages', async (orig) => ({
  ...(await orig<typeof import('@/lib/quotationMessages')>()),
  resolveQuotationMessage: vi.fn().mockResolvedValue({}),
}));

const msg = (over: Partial<InboxMessage>): InboxMessage => ({
  id: 'm1',
  version_id: 'v1',
  version_number: 1,
  kind: 'question',
  name: 'Mrs Rao',
  message: 'Which finish?',
  item_label: null,
  created_at: '2026-11-01T10:00:00Z',
  resolved_at: null,
  resolved_by_name: null,
  client_id: 'c1',
  client_name: 'Rao Family',
  client_contact: { phone: '+91 98765 43210' },
  ...over,
});

const RAO_OLD = msg({ id: 'a', message: 'Older question' });
const RAO_NEW = msg({
  id: 'b',
  message: 'Newer question',
  created_at: '2026-11-03T10:00:00Z',
  item_label: 'Hall · TV unit',
});
const SHAH_DONE = msg({
  id: 'c',
  client_id: 'c2',
  client_name: 'Shah',
  message: 'Shah was answered',
  resolved_at: '2026-11-02T00:00:00Z',
  resolved_by_name: 'Asha',
});

const renderPage = (messages: InboxMessage[]) => {
  vi.mocked(getInbox).mockResolvedValue(messages);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <InboxPage />
    </QueryClientProvider>
  );
};
const customers = () =>
  screen.findByRole('complementary', { name: 'Customers' });
const thread = () => screen.findByRole('region', { name: 'Conversation' });
const order = async () =>
  within(await thread())
    .getAllByText(/question$/)
    .map((el) => el.textContent);

describe('Inbox page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientParam = null;
  });

  it('says so when no customer has written', async () => {
    renderPage([]);
    expect(
      await screen.findByText(/No customer messages yet/)
    ).toBeInTheDocument();
  });

  it('lists one row per customer with the open count and last message', async () => {
    renderPage([RAO_OLD, RAO_NEW, SHAH_DONE]);
    const row = await within(await customers()).findByRole('button', {
      name: /Rao Family/,
    });
    expect(row).toHaveTextContent('2');
    expect(row).toHaveTextContent('Newer question');
    expect(
      within(await customers()).getAllByRole('button', { name: /Rao Family/ })
    ).toHaveLength(1);
  });

  it('hides customers with nothing open until "All" is chosen', async () => {
    renderPage([RAO_NEW, SHAH_DONE]);
    await within(await customers()).findByRole('button', {
      name: /Rao Family/,
    });
    expect(
      within(await customers()).queryByRole('button', { name: /Shah/ })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(
      within(await customers()).getByRole('button', { name: /Shah/ })
    ).toBeInTheDocument();
  });

  it('opens the chosen customer through the url', async () => {
    renderPage([RAO_NEW]);
    fireEvent.click(
      await within(await customers()).findByRole('button', {
        name: /Rao Family/,
      })
    );
    expect(replace).toHaveBeenCalledWith('/dashboard/inbox?client=c1');
  });

  it('shows the conversation of the customer in the url, even if resolved', async () => {
    clientParam = 'c2';
    renderPage([RAO_NEW, SHAH_DONE]);
    expect(
      await within(await thread()).findByText('Shah was answered')
    ).toBeInTheDocument();
    expect(within(await thread()).queryByText('Newer question')).toBeNull();
    expect(
      within(await thread()).getByText(/Resolved by Asha/)
    ).toBeInTheDocument();
  });

  it('shows the newest message first and flips with the toggle', async () => {
    clientParam = 'c1';
    renderPage([RAO_OLD, RAO_NEW]);
    await within(await thread()).findByText('Newer question');
    expect(await order()).toEqual(['Newer question', 'Older question']);
    fireEvent.click(
      screen.getByRole('button', { name: /Switch to oldest first/ })
    );
    expect(await order()).toEqual(['Older question', 'Newer question']);
    fireEvent.click(
      screen.getByRole('button', { name: /Switch to newest first/ })
    );
    expect(await order()).toEqual(['Newer question', 'Older question']);
  });

  it('tags a line question and edits that line', async () => {
    clientParam = 'c1';
    renderPage([RAO_NEW]);
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

  it('resolves one question', async () => {
    clientParam = 'c1';
    renderPage([RAO_NEW]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark resolved' })
    );
    await waitFor(() =>
      expect(resolveQuotationMessage).toHaveBeenCalledWith('b', true)
    );
  });

  it('reopens a resolved question', async () => {
    clientParam = 'c2';
    renderPage([SHAH_DONE]);
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() =>
      expect(resolveQuotationMessage).toHaveBeenCalledWith('c', false)
    );
  });

  it('resolves every open question of a customer at once', async () => {
    clientParam = 'c1';
    renderPage([RAO_OLD, RAO_NEW]);
    fireEvent.click(
      await screen.findByRole('button', { name: /Mark all resolved/ })
    );
    await waitFor(() =>
      expect(resolveQuotationMessage).toHaveBeenCalledTimes(2)
    );
    expect(resolveQuotationMessage).toHaveBeenCalledWith('a', true);
    expect(resolveQuotationMessage).toHaveBeenCalledWith('b', true);
  });

  it('has no "Mark all resolved" with a single open question', async () => {
    clientParam = 'c1';
    renderPage([RAO_NEW]);
    await within(await thread()).findByText('Newer question');
    expect(
      screen.queryByRole('button', { name: /Mark all resolved/ })
    ).toBeNull();
  });

  it('goes back to the customer list', async () => {
    clientParam = 'c1';
    renderPage([RAO_NEW]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Back to customers' })
    );
    expect(replace).toHaveBeenCalledWith('/dashboard/inbox');
  });
});

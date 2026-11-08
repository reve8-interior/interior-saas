import { describe, expect, it } from 'vitest';
import {
  groupByClient,
  inboxClientHref,
  matchesInboxFilter,
  openInboxCount,
  type InboxMessage,
} from '../inbox';

const msg = (over: Partial<InboxMessage>): InboxMessage => ({
  id: 'm1',
  version_id: 'v1',
  version_number: 1,
  kind: 'question',
  name: 'Mrs Rao',
  message: 'Finish?',
  item_label: null,
  created_at: '2026-10-31T10:00:00Z',
  resolved_at: null,
  resolved_by_name: null,
  client_id: 'c1',
  client_name: 'Rao',
  client_contact: { phone: '+91 98765 43210' },
  ...over,
});

const open = msg({ id: 'open' });
const resolved = msg({ id: 'done', resolved_at: '2026-10-31T11:00:00Z' });
const approved = msg({ id: 'ok', kind: 'approved', message: null });

describe('matchesInboxFilter', () => {
  it('"all" keeps every message', () => {
    for (const m of [open, resolved, approved]) {
      expect(matchesInboxFilter(m, 'all')).toBe(true);
    }
  });

  it('"open" keeps only unresolved questions', () => {
    expect(matchesInboxFilter(open, 'open')).toBe(true);
    expect(matchesInboxFilter(resolved, 'open')).toBe(false);
    expect(matchesInboxFilter(approved, 'open')).toBe(false);
  });
});

describe('openInboxCount', () => {
  it('is zero for an empty inbox', () => {
    expect(openInboxCount([])).toBe(0);
  });

  it('counts only questions still waiting on the designer', () => {
    expect(
      openInboxCount([open, resolved, approved, msg({ id: 'second' })])
    ).toBe(2);
  });
});

describe('groupByClient', () => {
  const other = (over: Partial<InboxMessage>) =>
    msg({ client_id: 'c2', client_name: 'Shah', ...over });

  it('puts customers with open questions first, then the most recent', () => {
    const threads = groupByClient([
      other({ id: 'a', resolved_at: '2026-11-01T00:00:00Z' }),
      msg({ id: 'b', created_at: '2026-10-01T00:00:00Z' }),
    ]);
    expect(threads.map((t) => t.client_id)).toEqual(['c1', 'c2']);
    expect(threads[0].openCount).toBe(1);
    expect(threads[1].openCount).toBe(0);
  });

  it('orders a thread oldest first and exposes the latest message', () => {
    const [thread] = groupByClient([
      msg({ id: 'new', created_at: '2026-10-02T00:00:00Z' }),
      msg({ id: 'old', created_at: '2026-10-01T00:00:00Z' }),
    ]);
    expect(thread.messages.map((m) => m.id)).toEqual(['old', 'new']);
    expect(thread.latest.id).toBe('new');
  });
});

describe('inboxClientHref', () => {
  it('links to the customer thread', () => {
    expect(inboxClientHref('abc')).toBe('/dashboard/inbox?client=abc');
  });
});

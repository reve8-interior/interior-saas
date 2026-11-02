import { describe, expect, it } from 'vitest';
import {
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

import { describe, expect, it } from 'vitest';
import {
  canExtend,
  isEndingSoon,
  matchesFilter,
  type SharedLink,
} from '../sharedLinks';

const NOW = new Date('2030-05-17T12:00:00Z');
const day = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

const link = (over: Partial<SharedLink> = {}): SharedLink => ({
  kind: 'quotation',
  id: 'l1',
  version_id: 'v1',
  client_id: 'c1',
  client_name: 'Mrs Rao',
  title: 'Quotation version 1',
  url: 'https://x/quotation/t',
  show_prices: false,
  expires_at: null,
  created_at: NOW.toISOString(),
  view_count: 0,
  last_viewed_at: null,
  response_kind: null,
  ...over,
});

describe('isEndingSoon', () => {
  it('is true for an active link ending within a week', () => {
    expect(isEndingSoon(link({ expires_at: day(3) }), NOW)).toBe(true);
  });

  it('is false for a far end date, no end date, or an expired link', () => {
    expect(isEndingSoon(link({ expires_at: day(30) }), NOW)).toBe(false);
    expect(isEndingSoon(link(), NOW)).toBe(false);
    expect(isEndingSoon(link({ expires_at: day(-1) }), NOW)).toBe(false);
  });
});

describe('matchesFilter', () => {
  it('separates active, expired and replied links', () => {
    const expired = link({ expires_at: day(-2) });
    const replied = link({ response_kind: 'approved' });
    expect(matchesFilter(expired, 'expired', NOW)).toBe(true);
    expect(matchesFilter(expired, 'active', NOW)).toBe(false);
    expect(matchesFilter(replied, 'replied', NOW)).toBe(true);
    expect(matchesFilter(link(), 'replied', NOW)).toBe(false);
    expect(matchesFilter(link(), 'all', NOW)).toBe(true);
  });
});

describe('canExtend', () => {
  it('is limited to quotation links', () => {
    expect(canExtend(link())).toBe(true);
    expect(canExtend(link({ kind: 'designs' }))).toBe(false);
    expect(canExtend(link({ kind: 'portfolio' }))).toBe(false);
  });
});

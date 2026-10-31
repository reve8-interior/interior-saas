import { describe, expect, it } from 'vitest';
import {
  countByClient,
  newReplies,
  replyKey,
  type AttentionItem,
} from '../attention';

const item = (client_id: string): AttentionItem => ({
  kind: 'needs_clarity',
  client_id,
  client_name: 'Mrs Rao',
  title: 'x',
  detail: null,
  at: null,
  path: '/',
  key: `clarity:${client_id}`,
  read: false,
});

describe('countByClient', () => {
  it('counts items per client', () => {
    expect(countByClient([item('a'), item('b'), item('a')])).toEqual({
      a: 2,
      b: 1,
    });
  });

  it('skips items already read', () => {
    expect(countByClient([{ ...item('a'), read: true }, item('a')])).toEqual({
      a: 1,
    });
  });

  it('is empty without items', () => {
    expect(countByClient([])).toEqual({});
  });
});

describe('newReplies', () => {
  const reply = (at: string): AttentionItem => ({
    ...item('a'),
    kind: 'customer_question',
    path: '/v',
    at,
  });

  it('returns only replies not seen yet', () => {
    const old = reply('2026-10-29T10:00:00Z');
    const fresh = reply('2026-10-29T11:00:00Z');
    expect(newReplies([old, fresh], new Set([replyKey(old)]))).toEqual([fresh]);
  });

  it('ignores items that are not customer replies', () => {
    expect(newReplies([item('a')], new Set())).toEqual([]);
  });
});

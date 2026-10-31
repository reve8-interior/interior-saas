import { describe, expect, it } from 'vitest';
import {
  isOpenQuestion,
  openQuestionCount,
  type QuotationMessage,
} from '@/lib/quotationMessages';

const msg = (over: Partial<QuotationMessage>): QuotationMessage => ({
  id: 'm1',
  version_id: 'v1',
  version_number: 1,
  kind: 'question',
  name: 'Mrs Rao',
  message: 'Finish?',
  created_at: '2026-10-31T10:00:00Z',
  resolved_at: null,
  resolved_by_name: null,
  ...over,
});

describe('open questions', () => {
  it('counts only unresolved questions', () => {
    const all = [
      msg({ id: 'a' }),
      msg({ id: 'b', resolved_at: '2026-10-31T11:00:00Z' }),
      msg({ id: 'c', kind: 'approved', message: null }),
      msg({ id: 'd' }),
    ];
    expect(openQuestionCount(all)).toBe(2);
  });

  it('never treats an approval as open', () => {
    expect(isOpenQuestion(msg({ kind: 'approved' }))).toBe(false);
  });
});

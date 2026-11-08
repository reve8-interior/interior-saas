import { describe, expect, it } from 'vitest';
import {
  findLineIdByLabel,
  isOpenQuestion,
  lineLabel,
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
  item_label: null,
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

describe('lineLabel / findLineIdByLabel', () => {
  const rooms = [
    {
      room: 'Hall',
      items: [
        { id: 'i1', description: 'TV unit', status: 'active' },
        { id: 'i2', description: 'Sofa', status: 'removed' },
      ],
    },
    {
      room: 'Kitchen',
      items: [
        { id: 'i3', description: 'TV unit', status: 'active' },
        { id: 'i4', description: 'Cabinet', status: 'active' },
        { id: 'i5', description: 'Cabinet', status: 'active' },
      ],
    },
  ];

  it('names a line "Room · description"', () => {
    expect(lineLabel('Hall', 'TV unit')).toBe('Hall · TV unit');
  });

  it('finds the line a question was about, scoped to its room', () => {
    expect(findLineIdByLabel(rooms, 'Hall · TV unit')).toBe('i1');
    expect(findLineIdByLabel(rooms, 'Kitchen · TV unit')).toBe('i3');
  });

  it('finds nothing for a renamed, removed or unknown line', () => {
    expect(findLineIdByLabel(rooms, 'Hall · Sofa')).toBeNull();
    expect(findLineIdByLabel(rooms, 'Hall · Old name')).toBeNull();
    expect(findLineIdByLabel(rooms, 'Garage · TV unit')).toBeNull();
  });

  it('refuses an ambiguous label rather than jumping to the wrong line', () => {
    expect(findLineIdByLabel(rooms, 'Kitchen · Cabinet')).toBeNull();
  });
});

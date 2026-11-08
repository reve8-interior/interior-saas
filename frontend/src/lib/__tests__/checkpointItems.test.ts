import { describe, expect, it } from 'vitest';
import {
  addDisabledReason,
  blankItem,
  insertAt,
  removeAt,
  setActionAt,
  findMissingItems,
  minutesBullets,
  parseStoredItems,
  setAllVerified,
  summarizeVerified,
  toQuotationPayload,
  updateExtraAt,
  updateItemAt,
  type LineItemData,
} from '../checkpointItems';
import type { LineItemColumnDef } from '../lineItemColumns';

const item = (over: Partial<LineItemData> = {}): LineItemData => ({
  ...blankItem(),
  room: 'Kitchen',
  description: 'Cabinets',
  ...over,
});

describe('parseStoredItems', () => {
  it('returns [] for anything that is not an array', () => {
    expect(parseStoredItems(undefined)).toEqual([]);
    expect(parseStoredItems({})).toEqual([]);
  });

  it('defaults legacy rows: add action, sqft unit, unverified', () => {
    const [row] = parseStoredItems([{ room: 'Hall', unit: null }]);
    expect(row).toMatchObject({
      action: 'add',
      unit: 'sqft',
      verified: false,
      target_item_id: null,
      est_time: null,
    });
  });

  it('keeps stored values', () => {
    const [row] = parseStoredItems([
      { action: 'remove', unit: 'nos', verified: true, target_item_id: 'x' },
    ]);
    expect(row).toMatchObject({
      action: 'remove',
      unit: 'nos',
      verified: true,
      target_item_id: 'x',
    });
  });

  it('skips non-object entries instead of throwing', () => {
    expect(parseStoredItems([null, 3, { room: 'A' }])).toHaveLength(1);
  });
});

describe('row updates', () => {
  it('updateItemAt changes only the targeted row', () => {
    const rows = [item(), item({ room: 'Bed' })];
    const next = updateItemAt(rows, 1, 'qty', 4);
    expect(next[1].qty).toBe(4);
    expect(next[0]).toBe(rows[0]);
    expect(rows[1].qty).toBeNull();
  });

  it('updateExtraAt merges into existing extras', () => {
    const rows = [item({ extra: { a: 1 } })];
    expect(updateExtraAt(rows, 0, 'b', 'x')[0].extra).toEqual({ a: 1, b: 'x' });
  });

  it('updateExtraAt works when extra is missing', () => {
    const rows = [{ ...item(), extra: undefined }];
    expect(updateExtraAt(rows, 0, 'b', null)[0].extra).toEqual({ b: null });
  });

  it('setAllVerified sets every row', () => {
    const rows = [item(), item({ verified: true })];
    expect(setAllVerified(rows, true).every((r) => r.verified)).toBe(true);
    expect(setAllVerified(rows, false).some((r) => r.verified)).toBe(false);
  });
});

describe('findMissingItems', () => {
  const columns = [
    {
      key: 'qty',
      label: 'Qty',
      type: 'number',
      enabled: true,
      required: true,
      builtin: true,
      locked: false,
    },
  ] satisfies LineItemColumnDef[];

  it('lists rows with empty mandatory fields and labels them', () => {
    const [m] = findMissingItems([item({ qty: null })], columns);
    expect(m).toEqual({
      idx: 0,
      label: 'Kitchen — Cabinets',
      missing: ['Qty'],
    });
  });

  it('falls back to the row number when the row has no name', () => {
    const [m] = findMissingItems(
      [item({ room: '', description: '' })],
      columns
    );
    expect(m.label).toBe('Row 1');
  });

  it('exempts removals', () => {
    expect(findMissingItems([item({ action: 'remove' })], columns)).toEqual([]);
  });

  it('passes complete rows', () => {
    expect(findMissingItems([item({ qty: 2 })], columns)).toEqual([]);
  });
});

describe('addDisabledReason', () => {
  const base = {
    sending: false,
    missingCount: 0,
    verifiedCount: 1,
  };

  it('is null when nothing blocks', () => {
    expect(addDisabledReason(base)).toBeNull();
  });
  it('is null while sending, whatever else is wrong', () => {
    expect(
      addDisabledReason({ ...base, sending: true, verifiedCount: 0 })
    ).toBeNull();
  });
  it('pluralises missing rows', () => {
    expect(addDisabledReason({ ...base, missingCount: 1 })).toMatch(
      /1 row first/
    );
    expect(addDisabledReason({ ...base, missingCount: 2 })).toMatch(
      /2 rows first/
    );
  });
  it('asks for a verified row', () => {
    expect(addDisabledReason({ ...base, verifiedCount: 0 })).toMatch(
      /verified/
    );
  });
});

describe('summarizeVerified', () => {
  it('counts verified rows per action', () => {
    const rows = [
      item({ verified: true }),
      item({ verified: true, action: 'update' }),
      item({ verified: true }),
      item({ verified: false, action: 'remove' }),
    ];
    expect(summarizeVerified(rows)).toEqual({ add: 2, update: 1 });
  });
});

describe('toQuotationPayload', () => {
  it('sends only quotation fields, defaulting extra and catalog type', () => {
    const [p] = toQuotationPayload([
      item({ verified: true, extra: undefined }),
    ]);
    expect(p).not.toHaveProperty('verified');
    expect(p.catalog_type).toBe('core_works');
    expect(p.extra).toEqual({});
    expect(p.room).toBe('Kitchen');
  });
});

describe('minutesBullets', () => {
  it('strips bullet markers and blank lines', () => {
    expect(minutesBullets('- one\n\n• two\n*  three\n  ')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
  it('returns [] for empty text', () => {
    expect(minutesBullets('')).toEqual([]);
  });
});

describe('removeAt / insertAt', () => {
  const rows = [item({ room: 'A' }), item({ room: 'B' }), item({ room: 'C' })];

  it('removes only the indexed row', () => {
    expect(removeAt(rows, 1).map((r) => r.room)).toEqual(['A', 'C']);
  });

  it('ignores an out-of-range index', () => {
    expect(removeAt(rows, 9)).toEqual(rows);
  });

  it('insertAt restores a removed row at its old position', () => {
    const removed = rows[1];
    expect(insertAt(removeAt(rows, 1), 1, removed)).toEqual(rows);
  });

  it('insertAt clamps to the end when the list shrank meanwhile', () => {
    expect(insertAt([rows[0]], 5, rows[2]).map((r) => r.room)).toEqual([
      'A',
      'C',
    ]);
  });
});

describe('generic row helpers', () => {
  it('work on rows that carry extra fields such as catalog_type', () => {
    const rows = [{ ...item(), catalog_type: 'core_works' }];
    const next = updateItemAt(rows, 0, 'room', 'Z');
    expect(next[0].catalog_type).toBe('core_works');
    expect(updateExtraAt(rows, 0, 'k', 1)[0].catalog_type).toBe('core_works');
  });

  it('blankItem accepts overrides', () => {
    expect(blankItem({ unit: 'nos' }).unit).toBe('nos');
  });
});

describe('setActionAt', () => {
  const linked = item({
    room: 'Hall',
    action: 'update',
    target_item_id: 'li-1',
    target_summary: 'Hall - Sofa',
  });
  const rows = [item({ room: 'A' }), linked, item({ room: 'C' })];

  it('changes only the indexed row', () => {
    const next = setActionAt(rows, 0, 'remove');
    expect(next.map((r) => r.action)).toEqual(['remove', 'update', 'add']);
  });

  it('keeps the link when switching between update and remove', () => {
    const next = setActionAt(rows, 1, 'remove');
    expect(next[1].action).toBe('remove');
    expect(next[1].target_item_id).toBe('li-1');
    expect(next[1].target_summary).toBe('Hall - Sofa');
  });

  it('drops the link when the row becomes new work', () => {
    const next = setActionAt(rows, 1, 'add');
    expect(next[1].action).toBe('add');
    expect(next[1].target_item_id).toBeNull();
    expect(next[1].target_summary).toBeNull();
  });

  it('leaves the other fields of the row alone', () => {
    const next = setActionAt(rows, 1, 'add');
    expect(next[1].room).toBe('Hall');
    expect(next[1].description).toBe(linked.description);
  });

  it('does not change the original list', () => {
    setActionAt(rows, 1, 'add');
    expect(rows[1].action).toBe('update');
  });

  it('ignores an out-of-range index', () => {
    expect(setActionAt(rows, 9, 'remove')).toEqual(rows);
  });
});

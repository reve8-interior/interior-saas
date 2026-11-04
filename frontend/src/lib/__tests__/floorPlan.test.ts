import { describe, expect, it } from 'vitest';
import {
  defaultChoice,
  leftOutNote,
  toConfirmItems,
  type DraftItem,
} from '@/lib/floorPlan';

const fresh: DraftItem = {
  room: 'Hall',
  description: 'TV unit',
  unit: 'sqft',
  raw_dimension: "8'x7'",
  qty: 56,
  rate: 1500,
  action: 'add',
  match: null,
};

const repeated = (
  fills: Array<'raw_dimension' | 'qty' | 'rate'>
): DraftItem => ({
  ...fresh,
  description: 'Wardrobe',
  match: {
    id: 'line-1',
    source: 'quotation',
    summary: 'Hall — Wardrobe',
    fills,
  },
});

describe('leftOutNote', () => {
  it('names the rows that were left out', () => {
    const note = leftOutNote([fresh, repeated([])]);
    expect(note).toContain('Hall — Wardrobe');
    expect(note).not.toContain('TV unit');
  });

  it('is empty when nothing was left out', () => {
    expect(leftOutNote([fresh, repeated(['rate'])])).toBe('');
  });
});

describe('toConfirmItems', () => {
  it('maps a new starter row to an add row, keeping blank rates blank', () => {
    const [row] = toConfirmItems([{ ...fresh, rate: null }]);
    expect(row).toMatchObject({
      action: 'add',
      target_item_id: null,
      room: 'Hall',
      raw_dimension: "8'x7'",
      qty: 56,
      rate: null,
      catalog_type: 'core_works',
    });
  });

  it('fills only the missing values of the existing line', () => {
    const [row] = toConfirmItems([repeated(['raw_dimension', 'qty'])]);
    expect(row).toMatchObject({
      action: 'update',
      target_item_id: 'line-1',
      raw_dimension: "8'x7'",
      qty: 56,
      rate: null,
    });
  });

  it('leaves out a row whose existing line has nothing to fill', () => {
    expect(defaultChoice(repeated([]))).toBe('skip');
    expect(toConfirmItems([repeated([])])).toEqual([]);
  });

  it('defaults to filling when something is missing', () => {
    expect(defaultChoice(repeated(['rate']))).toBe('fill');
  });

  it('skips a row already in an earlier draft unless added again', () => {
    const earlier: DraftItem = {
      ...fresh,
      match: {
        id: null,
        source: 'draft',
        summary: 'Hall — TV unit',
        fills: [],
      },
    };
    expect(defaultChoice(earlier)).toBe('skip');
    expect(toConfirmItems([earlier])).toEqual([]);
    const [row] = toConfirmItems([earlier], { 0: 'add' });
    expect(row).toMatchObject({ action: 'add', target_item_id: null });
  });

  it('adds a repeated row as a new line when asked', () => {
    const [row] = toConfirmItems([repeated(['rate'])], { 0: 'add' });
    expect(row).toMatchObject({ action: 'add', target_item_id: null, qty: 56 });
  });
});

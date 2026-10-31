import { describe, expect, it } from 'vitest';
import {
  blankRow,
  isFilled,
  materialLabel,
  rowPayload,
  rowPrice,
  rowProblem,
  withDescription,
} from '@/lib/lineItemRows';
import type { Material } from '@/lib/quotation';

const material: Material = {
  id: 'm1',
  name: 'Teak veneer',
  category: 'Wood',
  unit: 'nos',
  unit_cost: 900,
  vendor: null,
  updated_at: '2030-01-01T00:00:00Z',
};

describe('lineItemRows', () => {
  it('treats a row with only its default unit as blank', () => {
    expect(isFilled(blankRow(1, 'nos'))).toBe(false);
    expect(isFilled({ ...blankRow(1), qty: '2' })).toBe(true);
  });
  it('requires a description on a filled row', () => {
    expect(rowProblem('Hall', { ...blankRow(1), qty: '2' }, [])).toMatch(
      /Description/
    );
  });
  it('builds a payload with the shared room', () => {
    const row = { ...blankRow(1), description: 'Loft', qty: '2', rate: '10' };
    expect(rowPayload(' Hall ', row, [])).toMatchObject({
      room: 'Hall',
      description: 'Loft',
      qty: 2,
      rate: 10,
    });
  });
  it('prices qty × rate, leaving dimension rows to the server', () => {
    const row = { ...blankRow(1), qty: '2', rate: '10' };
    expect(rowPrice(row)).toBe(20);
    expect(rowPrice({ ...row, raw_dimension: "5'x3'" })).toBeNull();
    expect(rowPrice({ ...row, rate: '' })).toBeNull();
  });
  it('fills the row when a library entry is picked, not when typing', () => {
    const typed = withDescription(blankRow(1), 'Teak', [material]);
    expect(typed).toMatchObject({ description: 'Teak', material_id: '' });
    const picked = withDescription(blankRow(1), materialLabel(material), [
      material,
    ]);
    expect(picked).toMatchObject({
      description: 'Teak veneer',
      material_id: 'm1',
      unit: 'nos',
      rate: '900',
    });
  });
});

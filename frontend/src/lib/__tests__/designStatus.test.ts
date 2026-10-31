import { describe, expect, it } from 'vitest';
import { designProgress, linkedTotal, rateDrift } from '../designStatus';

const spot = (quotation_line_item_id: string | null) =>
  ({ quotation_line_item_id }) as never;

describe('designProgress', () => {
  it('counts hotspots and the ones already in the quotation', () => {
    expect(
      designProgress({ hotspots: [spot('a'), spot(null), spot('b')] })
    ).toEqual({ hotspots: 3, linked: 2 });
  });

  it('is zero for an unmarked design', () => {
    expect(designProgress({ hotspots: [] })).toEqual({
      hotspots: 0,
      linked: 0,
    });
  });
});

describe('linkedTotal', () => {
  it('adds the prices of linked lines and ignores the rest', () => {
    const prices = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(
      linkedTotal(
        { hotspots: [spot('a'), spot(null), spot('b'), spot('zz')] },
        prices
      )
    ).toBe(150);
  });
});

describe('rateDrift', () => {
  it('returns the new material rate when it differs from the line', () => {
    expect(rateDrift('500', 450)).toBe(500);
    expect(rateDrift(450, 450)).toBeNull();
  });

  it('is null when either rate is unknown', () => {
    expect(rateDrift(null, 450)).toBeNull();
    expect(rateDrift(500, null)).toBeNull();
  });
});

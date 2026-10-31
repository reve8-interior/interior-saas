import { describe, expect, it } from 'vitest';
import { moveId } from '../portfolioOrder';

describe('moveId', () => {
  it('swaps with the neighbour in the chosen direction', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at the ends or for an unknown id', () => {
    const ids = ['a', 'b'];
    expect(moveId(ids, 'a', -1)).toBe(ids);
    expect(moveId(ids, 'b', 1)).toBe(ids);
    expect(moveId(ids, 'x', 1)).toBe(ids);
  });

  it('does not mutate its input', () => {
    const ids = ['a', 'b'];
    moveId(ids, 'a', 1);
    expect(ids).toEqual(['a', 'b']);
  });
});

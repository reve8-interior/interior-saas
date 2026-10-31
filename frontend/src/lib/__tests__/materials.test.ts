import { describe, expect, it } from 'vitest';
import {
  distinctValues,
  isRowValid,
  parseCost,
  parseMargin,
  sortMaterials,
  type Material,
} from '../materials';

const mat = (over: Partial<Material>): Material => ({
  id: '1',
  name: 'A',
  category: 'x',
  unit: 'sqft',
  unit_cost: 1,
  vendor: null,
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('parseMargin', () => {
  it('accepts 0-100', () => {
    expect(parseMargin('0')).toBe(0);
    expect(parseMargin(' 12.5 ')).toBe(12.5);
    expect(parseMargin('100')).toBe(100);
  });
  it('rejects blank, NaN and out of range', () => {
    for (const bad of ['', '  ', 'abc', '-1', '100.1']) {
      expect(parseMargin(bad)).toBeNull();
    }
  });
});

describe('parseCost / isRowValid', () => {
  it('does not turn a cleared cost into 0', () => {
    expect(parseCost('')).toBeNull();
    expect(parseCost('0')).toBe(0);
  });
  it('flags missing name or cost', () => {
    const row = {
      name: 'Ply',
      category: 'c',
      unit: 'u',
      unit_cost: '5',
      vendor: null,
    };
    expect(isRowValid(row)).toBe(true);
    expect(isRowValid({ ...row, name: ' ' })).toBe(false);
    expect(isRowValid({ ...row, unit_cost: '' })).toBe(false);
  });
});

describe('distinctValues', () => {
  it('merges case variants', () => {
    expect(distinctValues(['Plywood', 'plywood', 'Tiles', ''])).toEqual([
      'Plywood',
      'Tiles',
    ]);
  });
});

describe('sortMaterials', () => {
  it('sorts by cost numerically and by name case-insensitively', () => {
    const items = [
      mat({ id: 'a', name: 'b', unit_cost: 10 }),
      mat({ id: 'b', name: 'A', unit_cost: 9 }),
    ];
    const ids = (k: 'unit_cost' | 'name', d: 'asc' | 'desc') =>
      sortMaterials(items, k, d).map((m) => m.id);
    expect(ids('unit_cost', 'asc')).toEqual(['b', 'a']);
    expect(ids('name', 'asc')).toEqual(['b', 'a']);
    expect(ids('name', 'desc')).toEqual(['a', 'b']);
  });
});

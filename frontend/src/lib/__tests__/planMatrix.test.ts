import { describe, expect, it } from 'vitest';
import {
  MATRIX_SECTIONS,
  NumberRow,
  TextRow,
  parseCell,
  parseText,
} from '@/lib/planMatrix';

const row = (changes: Partial<NumberRow> = {}): NumberRow => ({
  key: 'max_users',
  label: 'Team members',
  placeholder: 'Unlimited',
  nullable: true,
  ...changes,
});

describe('parseCell', () => {
  it('reads a whole number', () => {
    expect(parseCell(' 25 ', row())).toEqual({ ok: true, value: 25 });
  });

  it('treats empty as null when the field allows it, else 0', () => {
    expect(parseCell('', row())).toEqual({ ok: true, value: null });
    expect(parseCell('', row({ nullable: false }))).toEqual({
      ok: true,
      value: 0,
    });
  });

  it('rejects text and decimals', () => {
    expect(parseCell('abc', row()).ok).toBe(false);
    expect(parseCell('1.5', row()).ok).toBe(false);
  });

  it('enforces the range', () => {
    const sized = row({ min: 1, max: 100 });
    expect(parseCell('0', sized).ok).toBe(false);
    expect(parseCell('101', sized).ok).toBe(false);
    expect(parseCell('100', sized)).toEqual({ ok: true, value: 100 });
  });
});

describe('MATRIX_SECTIONS', () => {
  it('has no field twice', () => {
    const keys = MATRIX_SECTIONS.flatMap((s) => [
      ...s.numbers.map((r) => r.key),
      ...s.booleans.map((r) => r.key),
      ...(s.texts ?? []).map((r) => r.key),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseText', () => {
  const text = (key: TextRow['key']): TextRow => ({
    key,
    label: key,
    multiline: key === 'highlights',
    placeholder: '',
  });

  it('requires a name', () => {
    expect(parseText('  ', text('name')).ok).toBe(false);
    expect(parseText(' Solo ', text('name'))).toEqual({
      ok: true,
      value: 'Solo',
    });
  });

  it('saves an empty tagline as null', () => {
    expect(parseText('', text('tagline'))).toEqual({ ok: true, value: null });
  });

  it('splits bullet points by line and drops blanks', () => {
    expect(parseText('A\n\n B \n', text('highlights'))).toEqual({
      ok: true,
      value: ['A', 'B'],
    });
    expect(parseText('x'.repeat(121), text('highlights')).ok).toBe(false);
  });
});

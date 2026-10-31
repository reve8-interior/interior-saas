import { describe, expect, it } from 'vitest';
import {
  discountPercent,
  formFromItem,
  lastEdited,
  quotationSavings,
  toLineItemPayload,
  validateLineItemForm,
} from '../lineItemForm';
import type { LineItemColumnDef } from '../lineItemColumns';
import type { QuotationLineItem } from '../schemas/quotation';

const customCol = (
  over: Partial<LineItemColumnDef> = {}
): LineItemColumnDef => ({
  key: 'finish',
  label: 'Finish',
  type: 'text',
  required: false,
  builtin: false,
  enabled: true,
  locked: false,
  ...over,
});

const valid = () => ({
  ...formFromItem(undefined, { defaultRoom: 'Hall' }),
  description: 'Sofa',
});

describe('formFromItem', () => {
  it('uses defaults for a new line', () => {
    const f = formFromItem(undefined, {
      defaultRoom: 'Hall',
      defaultUnit: 'nos',
    });
    expect(f).toMatchObject({
      room: 'Hall',
      unit: 'nos',
      status: 'draft',
      qty: '',
    });
  });

  it('falls back to sqft with no defaults', () => {
    expect(formFromItem(undefined, {}).unit).toBe('sqft');
  });

  it('stringifies numbers, keeping zero', () => {
    const f = formFromItem(
      { room: 'A', qty: 0, rate: 12.5 } as QuotationLineItem,
      {}
    );
    expect(f.qty).toBe('0');
    expect(f.rate).toBe('12.5');
  });
});

describe('validateLineItemForm', () => {
  it('requires room and description', () => {
    expect(validateLineItemForm({ ...valid(), room: ' ' }, [], {})).toBe(
      'Room is required'
    );
    expect(validateLineItemForm({ ...valid(), description: '' }, [], {})).toBe(
      'Description is required'
    );
  });

  it('accepts empty and zero amounts', () => {
    expect(validateLineItemForm({ ...valid(), qty: '0' }, [], {})).toBeNull();
    expect(validateLineItemForm(valid(), [], {})).toBeNull();
  });

  it.each(['-1', 'abc', 'Infinity'])('rejects invalid amount %s', (v) => {
    expect(validateLineItemForm({ ...valid(), rate: v }, [], {})).toBe(
      'Rate must be a non-negative number'
    );
  });

  it('rejects a non-numeric value in a custom number column', () => {
    const cols = [customCol({ type: 'number', label: 'Thickness' })];
    expect(validateLineItemForm(valid(), cols, { finish: 'x' })).toBe(
      'Thickness must be a number'
    );
  });
});

describe('toLineItemPayload', () => {
  it('trims text and nulls blanks', () => {
    const p = toLineItemPayload(
      { ...valid(), description: ' Sofa ', remarks: '  ', qty: ' 2 ' },
      [],
      {},
      false
    );
    expect(p).toMatchObject({
      description: 'Sofa',
      remarks: null,
      qty: 2,
      material_id: null,
    });
  });

  it('includes status only when editing', () => {
    expect(toLineItemPayload(valid(), [], {}, false)).not.toHaveProperty(
      'status'
    );
    expect(
      toLineItemPayload({ ...valid(), status: 'agreed' }, [], {}, true).status
    ).toBe('agreed');
  });

  it('builds extras: null for blank, number for number columns', () => {
    const cols = [customCol(), customCol({ key: 'thick', type: 'number' })];
    const p = toLineItemPayload(
      valid(),
      cols,
      { finish: '', thick: '18' },
      false
    );
    expect(p.extra).toEqual({ finish: null, thick: 18 });
  });
});

describe('quotationSavings', () => {
  it('is null without a quotation', () => {
    expect(quotationSavings(null)).toBeNull();
  });
  it('is initial minus negotiated', () => {
    expect(quotationSavings({ initial_total: 100, negotiated_total: 80 })).toBe(
      20
    );
  });
});

describe('discountPercent', () => {
  it('is the saving as a share of the initial total', () => {
    expect(
      discountPercent({ initial_total: 1000, negotiated_total: 900 })
    ).toBe('10.0');
  });

  it('is null without a saving or a base', () => {
    expect(
      discountPercent({ initial_total: 1000, negotiated_total: 1000 })
    ).toBeNull();
    expect(
      discountPercent({ initial_total: 0, negotiated_total: 0 })
    ).toBeNull();
    expect(discountPercent(null)).toBeNull();
  });
});

describe('lastEdited', () => {
  it('returns the newest timestamp among the quotation and its lines', () => {
    expect(
      lastEdited({
        updated_at: '2030-01-01T00:00:00Z',
        rooms: [
          { items: [{ updated_at: '2030-01-03T00:00:00Z' }] },
          { items: [{ updated_at: '2030-01-02T00:00:00Z' }] },
        ],
      })
    ).toBe('2030-01-03T00:00:00Z');
  });

  it('is null without a quotation', () => {
    expect(lastEdited(null)).toBeNull();
  });
});

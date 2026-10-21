import { compareItems } from '@/lib/quotationCompare';
import type { QuotationLineItem } from '@/lib/schemas/quotation';

const item = (
  room: string,
  description: string,
  over: Partial<QuotationLineItem> = {}
): QuotationLineItem => ({
  id: `${room}-${description}`,
  quotation_id: 'q',
  room,
  position: 0,
  description,
  catalog_type: 'core_works',
  unit: 'sqft',
  raw_dimension: null,
  computed_sqft: null,
  qty: 1,
  rate: 100,
  initial_price: 100,
  negotiated_price: null,
  est_time: null,
  remarks: null,
  extra: {},
  status: 'priced',
  material_id: null,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('compareItems', () => {
  it('classifies added, removed, changed and same', () => {
    const before = [
      item('Living', 'TV Unit'),
      item('Living', 'Sofa'),
      item('Bed', 'Wardrobe'),
    ];
    const after = [
      item('Living', 'TV Unit', { rate: 120, initial_price: 120 }),
      item('Living', 'Sofa'),
      item('Kitchen', 'Chimney'),
    ];
    const r = compareItems(before, after);
    expect(r.counts).toEqual({ added: 1, removed: 1, changed: 1, same: 1 });
    const tv = r.rooms
      .find((x) => x.room === 'Living')
      ?.rows.find((x) => x.description === 'TV Unit');
    expect(tv?.changedFields).toEqual(['rate', 'amount']);
  });

  it('matches case-insensitively and ignores removed items', () => {
    const r = compareItems(
      [item('Living', 'tv unit'), item('Living', 'Old', { status: 'removed' })],
      [item('LIVING', 'TV Unit')]
    );
    expect(r.counts).toEqual({ added: 0, removed: 0, changed: 0, same: 1 });
  });

  it('prefers negotiated price for totals', () => {
    const r = compareItems(
      [item('A', 'x', { negotiated_price: 80 })],
      [item('A', 'x', { negotiated_price: 60 })]
    );
    expect(r.beforeTotal).toBe(80);
    expect(r.afterTotal).toBe(60);
  });
});

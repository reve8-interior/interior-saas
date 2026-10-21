import type { QuotationLineItem } from '@/lib/schemas/quotation';

export type CompareStatus = 'added' | 'removed' | 'changed' | 'same';

/** Fields shown side by side, in column order. */
export type CompareField = 'qty' | 'unit' | 'raw_dimension' | 'rate' | 'amount';

const COMPARE_FIELDS: CompareField[] = [
  'raw_dimension',
  'qty',
  'unit',
  'rate',
  'amount',
];

export const COMPARE_FIELD_LABELS: Record<CompareField, string> = {
  raw_dimension: 'Size',
  qty: 'Qty',
  unit: 'Unit',
  rate: 'Rate',
  amount: 'Amount',
};

export interface CompareRow {
  room: string;
  description: string;
  status: CompareStatus;
  before: QuotationLineItem | null;
  after: QuotationLineItem | null;
  /** Fields whose value differs (empty unless status is "changed"). */
  changedFields: CompareField[];
}

export interface CompareRoom {
  room: string;
  rows: CompareRow[];
  beforeTotal: number;
  afterTotal: number;
}

export interface CompareResult {
  rooms: CompareRoom[];
  counts: Record<CompareStatus, number>;
  beforeTotal: number;
  afterTotal: number;
}

/** The price the customer pays for an item. */
const itemAmount = (item: QuotationLineItem): number =>
  item.negotiated_price ?? item.initial_price ?? 0;

export function fieldValue(
  item: QuotationLineItem,
  field: CompareField
): string | number | null {
  if (field === 'amount') return itemAmount(item);
  return item[field];
}

/**
 * Items are matched on room + description (case-insensitive). Saved
 * versions are frozen copies, so row ids cannot be used. Duplicates of the
 * same key are paired in order.
 */
function keyed(items: QuotationLineItem[]): Map<string, QuotationLineItem> {
  const seen = new Map<string, number>();
  const out = new Map<string, QuotationLineItem>();
  for (const item of items) {
    if (item.status === 'removed') continue;
    const base = `${item.room.trim().toLowerCase()}\u0000${item.description
      .trim()
      .toLowerCase()}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}\u0000${n}`, item);
  }
  return out;
}

const sameValue = (
  a: string | number | null,
  b: string | number | null
): boolean => (a ?? '') === (b ?? '');

/** Diff two flat lists of line items, grouped by room. */
export function compareItems(
  before: QuotationLineItem[],
  after: QuotationLineItem[]
): CompareResult {
  const a = keyed(before);
  const b = keyed(after);
  const rooms = new Map<string, CompareRoom>();
  const counts: Record<CompareStatus, number> = {
    added: 0,
    removed: 0,
    changed: 0,
    same: 0,
  };

  const roomFor = (room: string): CompareRoom => {
    const existing = rooms.get(room);
    if (existing) return existing;
    const created: CompareRoom = {
      room,
      rows: [],
      beforeTotal: 0,
      afterTotal: 0,
    };
    rooms.set(room, created);
    return created;
  };

  // Walk "after" first so rooms follow the newer ordering, then "before"-only.
  for (const [key, item] of b) {
    const prev = a.get(key) ?? null;
    const changedFields = prev
      ? COMPARE_FIELDS.filter(
          (f) => !sameValue(fieldValue(prev, f), fieldValue(item, f))
        )
      : [];
    const status: CompareStatus = !prev
      ? 'added'
      : changedFields.length > 0
        ? 'changed'
        : 'same';
    counts[status] += 1;
    const room = roomFor(item.room);
    room.rows.push({
      room: item.room,
      description: item.description,
      status,
      before: prev,
      after: item,
      changedFields,
    });
  }
  for (const [key, item] of a) {
    if (b.has(key)) continue;
    counts.removed += 1;
    roomFor(item.room).rows.push({
      room: item.room,
      description: item.description,
      status: 'removed',
      before: item,
      after: null,
      changedFields: [],
    });
  }

  let beforeTotal = 0;
  let afterTotal = 0;
  for (const room of rooms.values()) {
    for (const row of room.rows) {
      if (row.before) room.beforeTotal += itemAmount(row.before);
      if (row.after) room.afterTotal += itemAmount(row.after);
    }
    beforeTotal += room.beforeTotal;
    afterTotal += room.afterTotal;
  }

  return { rooms: [...rooms.values()], counts, beforeTotal, afterTotal };
}

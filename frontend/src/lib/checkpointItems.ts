import type { ConfirmLineItem, ItemAction } from '@/lib/checkpoints';
import {
  missingRequiredFields,
  type LineItemColumnDef,
} from '@/lib/lineItemColumns';

/** One editable extracted row on a checkpoint. */
export interface LineItemData {
  action: ItemAction;
  target_item_id: string | null;
  target_summary: string | null;
  room: string;
  description: string;
  unit: string;
  raw_dimension: string | null;
  qty: number | null;
  rate: number | null;
  est_time: string | null;
  remarks: string | null;
  agreed_price?: number | null;
  extra?: Record<string, string | number | null>;
  verified: boolean;
}

export interface MissingItem {
  idx: number;
  label: string;
  missing: string[];
}

/** An empty row so a thin or empty extraction is not a dead end. */
export function blankItem(overrides: Partial<LineItemData> = {}): LineItemData {
  return {
    action: 'add',
    target_item_id: null,
    target_summary: null,
    room: '',
    description: '',
    unit: 'sqft',
    raw_dimension: null,
    qty: null,
    rate: null,
    est_time: null,
    remarks: null,
    extra: {},
    verified: false,
    ...overrides,
  };
}

/**
 * Rows from `structured_diff.line_items`. Rows saved before the delta-aware
 * agent carry no action (they were all new work); a missing unit defaults to
 * sqft so the select shows the stored value rather than a silent mismatch.
 */
export function parseStoredItems(raw: unknown): LineItemData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (li): li is Record<string, unknown> =>
        typeof li === 'object' && li !== null
    )
    .map(
      (li) =>
        ({
          ...li,
          action: (li.action as ItemAction | undefined) ?? 'add',
          target_item_id:
            (li.target_item_id as string | null | undefined) ?? null,
          target_summary:
            (li.target_summary as string | null | undefined) ?? null,
          unit: (li.unit as string | null | undefined) || 'sqft',
          est_time: (li.est_time as string | null | undefined) ?? null,
          verified: (li.verified as boolean | undefined) ?? false,
        }) as LineItemData
    );
}

export function updateItemAt<T extends object>(
  items: T[],
  idx: number,
  field: keyof T,
  value: string | number | boolean | null
): T[] {
  return items.map((item, i) =>
    i === idx ? { ...item, [field]: value } : item
  );
}

/**
 * Changes what a row does to the quotation. A new row has no existing line
 * to point at, so choosing "New" drops the link; update and remove keep it
 * (without one, the quotation is searched by room and description).
 */
export function setActionAt<
  T extends {
    action: ItemAction;
    target_item_id?: string | null;
    target_summary?: string | null;
  },
>(items: T[], idx: number, action: ItemAction): T[] {
  return items.map((item, i) => {
    if (i !== idx) return item;
    return action === 'add'
      ? { ...item, action, target_item_id: null, target_summary: null }
      : { ...item, action };
  });
}

export function updateExtraAt<
  T extends { extra?: Record<string, string | number | null> | null },
>(items: T[], idx: number, key: string, value: string | number | null): T[] {
  return items.map((item, i) =>
    i === idx
      ? { ...item, extra: { ...(item.extra ?? {}), [key]: value } }
      : item
  );
}

export function removeAt<T>(items: T[], idx: number): T[] {
  return items.filter((_, i) => i !== idx);
}

/** Puts a row back at `idx`, or at the end if the list has shrunk since. */
export function insertAt<T>(items: T[], idx: number, item: T): T[] {
  const next = [...items];
  next.splice(Math.min(idx, next.length), 0, item);
  return next;
}

export function setAllVerified(
  items: LineItemData[],
  verified: boolean
): LineItemData[] {
  return items.map((item) => ({ ...item, verified }));
}

/**
 * Rows missing mandatory columns. A removal names an existing item instead of
 * describing one, so the mandatory-column rules do not apply (mirrors backend).
 */
export function findMissingItems(
  items: LineItemData[],
  columns: LineItemColumnDef[]
): MissingItem[] {
  return items
    .map((li, idx) => ({
      idx,
      label:
        [li.room, li.description].filter(Boolean).join(' — ') ||
        `Row ${idx + 1}`,
      missing: li.action === 'remove' ? [] : missingRequiredFields(li, columns),
    }))
    .filter((x) => x.missing.length > 0);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Why "add to quotation" is disabled, or null when it is allowed. */
export function addDisabledReason(state: {
  sending: boolean;
  missingCount: number;
  verifiedCount: number;
}): string | null {
  if (state.sending) return null;
  if (state.missingCount > 0)
    return `Fill in the missing fields on ${plural(state.missingCount, 'row')} first.`;
  if (state.verifiedCount === 0) return 'Tick at least one row as verified.';
  return null;
}

/** Verified rows counted per action. */
export function summarizeVerified(
  items: LineItemData[]
): Partial<Record<ItemAction, number>> {
  const out: Partial<Record<ItemAction, number>> = {};
  for (const i of items) {
    if (i.verified) out[i.action] = (out[i.action] ?? 0) + 1;
  }
  return out;
}

export function toQuotationPayload(items: LineItemData[]): ConfirmLineItem[] {
  return items.map((li) => ({
    action: li.action,
    target_item_id: li.target_item_id,
    target_summary: li.target_summary,
    room: li.room,
    description: li.description,
    unit: li.unit,
    raw_dimension: li.raw_dimension,
    qty: li.qty,
    rate: li.rate,
    est_time: li.est_time,
    remarks: li.remarks,
    agreed_price: li.agreed_price ?? null,
    catalog_type: 'core_works',
    extra: li.extra ?? {},
  }));
}

/** Meeting minutes as plain bullet lines. */
export function minutesBullets(summary: string): string[] {
  return summary
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

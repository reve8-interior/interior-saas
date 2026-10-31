import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import type {
  LineItemCreate,
  LineItemStatus,
  LineItemUpdate,
  Quotation,
  QuotationLineItem,
} from '@/lib/schemas/quotation';

/** Text-field state of the add/edit line item form. */
export interface LineItemFormState {
  room: string;
  description: string;
  unit: string;
  raw_dimension: string;
  qty: string;
  rate: string;
  negotiated_price: string;
  est_time: string;
  remarks: string;
  status: LineItemStatus;
  material_id: string;
}

const str = (n: number | null | undefined) => (n != null ? String(n) : '');

export function formFromItem(
  item: QuotationLineItem | undefined,
  defaults: { defaultRoom?: string; defaultUnit?: string }
): LineItemFormState {
  return {
    room: item?.room ?? defaults.defaultRoom ?? '',
    description: item?.description ?? '',
    unit: item?.unit ?? defaults.defaultUnit ?? 'sqft',
    raw_dimension: item?.raw_dimension ?? '',
    qty: str(item?.qty),
    rate: str(item?.rate),
    negotiated_price: str(item?.negotiated_price),
    est_time: item?.est_time ?? '',
    remarks: item?.remarks ?? '',
    status: item?.status ?? 'draft',
    material_id: item?.material_id ?? '',
  };
}

/** Initial text for each custom column's input. */
export function extraFormFrom(
  item: QuotationLineItem | undefined,
  customCols: LineItemColumnDef[]
): Record<string, string> {
  return Object.fromEntries(
    customCols.map((c) => [c.key, str(item?.extra?.[c.key] as number | null)])
  );
}

const numOrNull = (v: string): number | null =>
  v.trim() === '' ? null : Number(v);

const isAmount = (v: string) =>
  v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0);

/** The first problem with the form, or null when it can be submitted. */
export function validateLineItemForm(
  form: LineItemFormState,
  customCols: LineItemColumnDef[],
  extraForm: Record<string, string>
): string | null {
  if (!form.room.trim()) return 'Room is required';
  if (!form.description.trim()) return 'Description is required';
  for (const [label, v] of [
    ['Qty', form.qty],
    ['Rate', form.rate],
    ['Negotiated price', form.negotiated_price],
  ] as const) {
    if (!isAmount(v)) return `${label} must be a non-negative number`;
  }
  for (const c of customCols) {
    const raw = (extraForm[c.key] ?? '').trim();
    if (c.type === 'number' && raw && !Number.isFinite(Number(raw)))
      return `${c.label} must be a number`;
  }
  return null;
}

export function toLineItemPayload(
  form: LineItemFormState,
  customCols: LineItemColumnDef[],
  extraForm: Record<string, string>,
  editing: boolean
): LineItemCreate & LineItemUpdate {
  const payload: LineItemCreate & LineItemUpdate = {
    room: form.room.trim(),
    description: form.description.trim(),
    unit: form.unit,
    raw_dimension: form.raw_dimension.trim() || null,
    qty: numOrNull(form.qty),
    rate: numOrNull(form.rate),
    negotiated_price: numOrNull(form.negotiated_price),
    est_time: form.est_time.trim() || null,
    remarks: form.remarks.trim() || null,
    extra: Object.fromEntries(
      customCols.map((c) => {
        const raw = (extraForm[c.key] ?? '').trim();
        if (!raw) return [c.key, null];
        return [c.key, c.type === 'number' ? Number(raw) : raw];
      })
    ),
    material_id: form.material_id || null,
  };
  if (editing) payload.status = form.status;
  return payload;
}

/** What negotiation has saved so far; null until a quotation exists. */
export function quotationSavings(
  quotation:
    | Pick<Quotation, 'initial_total' | 'negotiated_total'>
    | null
    | undefined
): number | null {
  return quotation
    ? quotation.initial_total - quotation.negotiated_total
    : null;
}

/** Discount as a percentage of the initial total, one decimal; null when there is none. */
export function discountPercent(
  quotation:
    | Pick<Quotation, 'initial_total' | 'negotiated_total'>
    | null
    | undefined
): string | null {
  const saved = quotationSavings(quotation);
  if (!quotation || saved == null || saved <= 0 || quotation.initial_total <= 0)
    return null;
  return ((saved / quotation.initial_total) * 100).toFixed(1);
}

/** Newest change across the quotation and its lines, as an ISO string ('' when none is known). */
export function lastEdited(
  quotation:
    | {
        updated_at?: string;
        rooms: { items: { updated_at: string }[] }[];
      }
    | null
    | undefined
): string | null {
  if (!quotation) return null;
  let latest = quotation.updated_at ?? '';
  for (const room of quotation.rooms)
    for (const item of room.items)
      if (item.updated_at > latest) latest = item.updated_at;
  return latest || null;
}

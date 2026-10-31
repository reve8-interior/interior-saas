import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import {
  formFromItem,
  toLineItemPayload,
  validateLineItemForm,
  type LineItemFormState,
} from '@/lib/lineItemForm';
import type { Material } from '@/lib/quotation';
import type { LineItemCreate } from '@/lib/schemas/quotation';

/** One row of the multi-row add sheet; the room is shared by the whole sheet. */
export interface LineItemRow {
  id: number;
  description: string;
  unit: string;
  raw_dimension: string;
  qty: string;
  rate: string;
  material_id: string;
  extra: Record<string, string>;
}

export function blankRow(id: number, unit = 'sqft'): LineItemRow {
  return {
    id,
    description: '',
    unit,
    raw_dimension: '',
    qty: '',
    rate: '',
    material_id: '',
    extra: {},
  };
}

/** A row the user typed in. Its unit alone doesn't count: it has a default. */
export function isFilled(row: LineItemRow): boolean {
  return (
    [row.description, row.raw_dimension, row.qty, row.rate].some((v) =>
      v.trim()
    ) || Object.values(row.extra).some((v) => v.trim())
  );
}

function toForm(room: string, row: LineItemRow): LineItemFormState {
  const { description, unit, raw_dimension, qty, rate, material_id } = row;
  return {
    ...formFromItem(undefined, { defaultRoom: room }),
    description,
    unit,
    raw_dimension,
    qty,
    rate,
    material_id,
  };
}

/** The first problem with a row, or null when it can be saved. */
export function rowProblem(
  room: string,
  row: LineItemRow,
  customCols: LineItemColumnDef[]
): string | null {
  return validateLineItemForm(toForm(room, row), customCols, row.extra);
}

export function rowPayload(
  room: string,
  row: LineItemRow,
  customCols: LineItemColumnDef[]
): LineItemCreate {
  return toLineItemPayload(toForm(room, row), customCols, row.extra, false);
}

/** Qty × rate; null when it can't be known yet or a dimension decides on save. */
export function rowPrice(row: LineItemRow): number | null {
  if (row.raw_dimension.trim() || !row.qty.trim() || !row.rate.trim())
    return null;
  const price = Number(row.qty) * Number(row.rate);
  return Number.isFinite(price) ? price : null;
}

export const materialLabel = (m: Material) =>
  `${m.name} (${m.category}) · ₹${m.unit_cost.toLocaleString('en-IN')}/${m.unit}`;

/**
 * Typing is a plain description; picking a library entry (its exact label)
 * links the material and fills the row from it.
 */
export function withDescription(
  row: LineItemRow,
  value: string,
  materials: Material[]
): LineItemRow {
  const match = materials.find((m) => materialLabel(m) === value);
  if (!match) return { ...row, description: value };
  return {
    ...row,
    description: match.name,
    material_id: match.id,
    unit: match.unit,
    rate: String(match.unit_cost),
  };
}

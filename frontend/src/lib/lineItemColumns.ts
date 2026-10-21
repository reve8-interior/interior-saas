/**
 * User-configurable quotation line-item columns.
 *
 * Definitions live in the backend (app_settings, edited on the Column
 * Setup page) and drive every place a line item is shown or validated:
 * the AI extract modal, checkpoint cards, the quotation table, and the
 * Excel export. Custom (non-builtin) column values are stored per item
 * in its `extra` map.
 *
 * DEFAULT_LINE_ITEM_COLUMNS mirrors
 * backend/services/column_settings.py — keep both in sync.
 */

import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export interface LineItemColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number';
  required: boolean;
  builtin: boolean;
  enabled: boolean;
  locked: boolean;
}

export const DEFAULT_LINE_ITEM_COLUMNS: LineItemColumnDef[] = [
  // prettier-ignore
  { key: 'room', label: 'Room', type: 'text', required: true, builtin: true, enabled: true, locked: true },
  // prettier-ignore
  { key: 'description', label: 'Description', type: 'text', required: true, builtin: true, enabled: true, locked: true },
  // prettier-ignore
  { key: 'unit', label: 'Unit', type: 'text', required: true, builtin: true, enabled: true, locked: false },
  // prettier-ignore
  { key: 'raw_dimension', label: 'Dimension', type: 'text', required: false, builtin: true, enabled: true, locked: false },
  // prettier-ignore
  { key: 'qty', label: 'Qty', type: 'number', required: false, builtin: true, enabled: true, locked: false },
  // prettier-ignore
  { key: 'rate', label: 'Rate (₹)', type: 'number', required: false, builtin: true, enabled: true, locked: false },
  // prettier-ignore
  { key: 'est_time', label: 'Est. Time', type: 'text', required: false, builtin: true, enabled: true, locked: false },
  // prettier-ignore
  { key: 'remarks', label: 'Remarks', type: 'text', required: false, builtin: true, enabled: true, locked: false },
];

export function fetchLineItemColumns(): Promise<{
  columns: LineItemColumnDef[];
}> {
  return api.get<{ columns: LineItemColumnDef[] }>(
    '/settings/line-item-columns'
  );
}

export function saveLineItemColumns(
  columns: LineItemColumnDef[]
): Promise<{ columns: LineItemColumnDef[] }> {
  return api.put<{ columns: LineItemColumnDef[] }>(
    '/settings/line-item-columns',
    { columns }
  );
}

/** Column definitions with the defaults as fallback while loading. */
export function useLineItemColumns(): {
  columns: LineItemColumnDef[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['line-item-columns'],
    queryFn: fetchLineItemColumns,
    staleTime: 60_000,
  });
  return {
    columns: data?.columns ?? DEFAULT_LINE_ITEM_COLUMNS,
    isLoading,
  };
}

/** Column label with a trailing * when the column is mandatory. */
export function columnLabel(col: LineItemColumnDef): string {
  return col.required ? `${col.label} *` : col.label;
}

/** Shape both grids share: builtin fields + custom values in `extra`. */
export interface HasLineItemValues {
  extra?: Record<string, string | number | null> | null;
}

function columnValue(item: HasLineItemValues, col: LineItemColumnDef): unknown {
  if (!col.builtin) return (item.extra ?? {})[col.key];
  return (item as unknown as Record<string, unknown>)[col.key];
}

function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === 'string' && !value.trim());
}

/** Labels of enabled mandatory columns that are empty on the item. */
export function missingRequiredFields(
  item: HasLineItemValues,
  columns: LineItemColumnDef[]
): string[] {
  return columns
    .filter((c) => c.enabled && c.required && isEmpty(columnValue(item, c)))
    .map((c) => c.label);
}

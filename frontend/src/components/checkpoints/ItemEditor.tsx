'use client';

import { api } from '@/lib/api';
import { type ItemAction } from '@/lib/checkpoints';
import {
  type LineItemColumnDef,
  columnLabel,
  missingRequiredFields,
} from '@/lib/lineItemColumns';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { fmtRupees } from '@/lib/format';
import { CardItem, LineItemData } from './types';

// ── Shared styles ─────────────────────────────────────────────────────────────

// Matches the quotation table: 13px text, tight rows.
const cellInputCls = 'field !rounded-lg !px-2 !py-1 !text-[13px]';

const UNITS = ['sqft', 'rft', 'nos', 'sets', 'lump sum', 'dimension'];

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<ItemAction, { label: string; cls: string }> = {
  add: {
    label: 'New',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  update: {
    label: 'Update',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  remove: {
    label: 'Remove',
    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

/**
 * What this row does to the quotation. An update or removal names the
 * live item it targets, so the verifier can see what is about to change
 * rather than inferring it from a description.
 */
/** Persists edited rows; a failed save must be visible, not look saved. */
export function saveExtractedItems(
  checkpointId: string,
  lineItems: LineItemData[]
): void {
  api
    .patch(`/checkpoints/${checkpointId}/extracted-items`, {
      line_items: lineItems,
    })
    .catch((err) =>
      // Fixed id so a burst of failed edits shows a single toast.
      toast.error(
        errorMessage(err, 'Changes were not saved — check your connection.'),
        { id: 'extracted-items-save-failed' }
      )
    );
}

export function ActionBadge({
  action,
  targetSummary,
  agreedPrice,
}: {
  action: ItemAction;
  targetSummary: string | null;
  agreedPrice?: number | null;
}) {
  const { label, cls } = ACTION_STYLES[action] ?? ACTION_STYLES.add;
  return (
    <>
      <span
        title={
          targetSummary
            ? `Currently on the quotation: ${targetSummary}`
            : 'Not on the quotation yet'
        }
        className={`badge ${cls}`}
      >
        {label}
      </span>
      {agreedPrice != null && (
        <span className="block whitespace-nowrap text-xs font-semibold tabular-nums text-dark-700 dark:text-dark-200">
          Agreed {fmtRupees(agreedPrice)}
        </span>
      )}
    </>
  );
}

const ACTION_HINT: Record<ItemAction, string> = {
  add: 'Adds a new row to the quotation',
  update: 'Changes a row that is already on the quotation',
  remove: 'Takes a row off the quotation',
};

/** The action as a choice, for rows that can still be changed. */
export function ActionSelect({
  action,
  targetSummary,
  index,
  onChange,
}: {
  action: ItemAction;
  targetSummary: string | null;
  index: number;
  onChange: (action: ItemAction) => void;
}) {
  const { cls } = ACTION_STYLES[action] ?? ACTION_STYLES.add;
  return (
    <select
      value={action}
      onChange={(e) => onChange(e.target.value as ItemAction)}
      aria-label={`Action for row ${index + 1}`}
      title={
        targetSummary
          ? `Currently on the quotation: ${targetSummary}`
          : ACTION_HINT[action]
      }
      className={`badge cursor-pointer border-0 py-1 pr-6 ${cls}`}
    >
      {(Object.keys(ACTION_STYLES) as ItemAction[]).map((a) => (
        <option key={a} value={a}>
          {ACTION_STYLES[a].label}
        </option>
      ))}
    </select>
  );
}

/** Bulleted panel for agent notes and pipeline corrections. */
export function NotePanel({
  title,
  notes,
  tone,
  collapsible = false,
}: {
  title: string;
  notes: string[];
  tone: 'amber' | 'slate';
  /** Fold the list behind its title so it doesn't compete with the rows. */
  collapsible?: boolean;
}) {
  if (notes.length === 0) return null;
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      : 'border-line bg-primary-50/60 text-dark-600 dark:border-line dark:bg-dark-900/60 dark:text-dark-300';
  if (collapsible) {
    return (
      <details className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
        <summary className="cursor-pointer font-medium">
          {title} ({notes.length})
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
    );
  }
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Shared dynamic line-item cell ─────────────────────────────────────────────

// Builtin string fields that must stay strings (never null)
const NON_NULLABLE_KEYS = new Set(['room', 'description', 'unit']);

export function cellClass(col: LineItemColumnDef): string {
  if (col.key === 'description') return 'min-w-[240px]';
  if (col.key === 'remarks') return 'min-w-[180px]';
  if (col.type === 'number') return 'min-w-[96px]';
  if (col.key === 'raw_dimension' || col.key === 'est_time')
    return 'min-w-[120px]';
  return 'min-w-[120px]';
}

export const STICKY = 'sticky z-10 bg-white dark:bg-dark-900';

export function ItemCell({
  col,
  item,
  onChange,
}: {
  col: LineItemColumnDef;
  item: { extra?: Record<string, string | number | null> | null };
  onChange: (
    key: string,
    value: string | number | null,
    isCustom: boolean
  ) => void;
}) {
  const raw = col.builtin
    ? (item as unknown as Record<string, unknown>)[col.key]
    : (item.extra ?? {})[col.key];
  const value = raw == null ? '' : String(raw);
  const invalid = col.required && !value.trim();
  const cls = `${cellInputCls} ${invalid ? 'field-invalid' : ''}`;

  if (col.key === 'unit') {
    return (
      <select
        value={value || 'sqft'}
        onChange={(e) => onChange(col.key, e.target.value, false)}
        className={cls}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(
            col.key,
            e.target.value ? parseFloat(e.target.value) : null,
            !col.builtin
          )
        }
        className={cls}
      />
    );
  }
  const nullable = !NON_NULLABLE_KEYS.has(col.key);
  return (
    <input
      value={value}
      onChange={(e) =>
        onChange(
          col.key,
          nullable ? e.target.value || null : e.target.value,
          !col.builtin
        )
      }
      className={cls}
      placeholder={
        col.key === 'raw_dimension'
          ? 'e.g. 6x8'
          : col.key === 'est_time'
            ? 'e.g. 2 weeks'
            : col.required
              ? `${col.label} *`
              : undefined
      }
    />
  );
}

// ── Mobile item card ──────────────────────────────────────────────────────────

/** Fields that need the full card width on a phone. */
const WIDE_KEYS = new Set(['room', 'description', 'remarks']);

/**
 * One line item as a stacked card (phones). The wide editable table stays for
 * desktop; here every field gets a label and a full-height touch target.
 */
export function ItemCard({
  item,
  index,
  cols,
  allCols,
  onChange,
  onVerify,
  onRemove,
  onActionChange,
}: {
  item: CardItem;
  index: number;
  cols: LineItemColumnDef[];
  allCols: LineItemColumnDef[];
  onChange: (
    key: string,
    value: string | number | null,
    isCustom: boolean
  ) => void;
  onVerify?: (verified: boolean) => void;
  onRemove?: () => void;
  /** Makes the action a choice instead of a label. */
  onActionChange?: (action: ItemAction) => void;
}) {
  const missing =
    item.action !== 'remove' && missingRequiredFields(item, allCols).length > 0;
  const tone = missing
    ? 'border-red-300 bg-red-50/70 dark:border-red-400/30 dark:bg-red-500/10'
    : item.verified
      ? 'border-green-300/80 bg-green-50/60 dark:border-green-400/25 dark:bg-green-500/10'
      : 'border-line bg-surface dark:border-line dark:bg-white/[0.03]';
  return (
    <li className={`rounded-2xl border p-3.5 ${tone}`}>
      <div className="flex min-h-11 items-center gap-3">
        {onVerify && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-dark-800 dark:text-dark-100">
            <input
              type="checkbox"
              checked={Boolean(item.verified)}
              onChange={(e) => onVerify(e.target.checked)}
            />
            Verified
          </label>
        )}
        {onActionChange ? (
          <ActionSelect
            action={item.action}
            targetSummary={item.target_summary}
            index={index}
            onChange={onActionChange}
          />
        ) : (
          <ActionBadge
            action={item.action}
            targetSummary={item.target_summary}
            agreedPrice={item.agreed_price}
          />
        )}
        <span className="ml-auto text-xs font-medium text-dark-500 dark:text-dark-400">
          Row {index + 1}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove row ${index + 1}`}
            title={`Remove row ${index + 1}`}
            className="icon-btn icon-btn-danger"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {cols.map((col) => (
          <label
            key={col.key}
            className={WIDE_KEYS.has(col.key) ? 'col-span-2' : ''}
          >
            <span className="field-label">{columnLabel(col)}</span>
            <ItemCell col={col} item={item} onChange={onChange} />
          </label>
        ))}
      </div>
    </li>
  );
}

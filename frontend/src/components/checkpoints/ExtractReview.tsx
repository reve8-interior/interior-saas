'use client';

import {
  type ConfirmLineItem,
  type ExtractionResponse,
  type ItemAction,
} from '@/lib/checkpoints';
import { columnLabel, missingRequiredFields } from '@/lib/lineItemColumns';
import { Trash2 } from 'lucide-react';
import { INPUT_CLS } from '@/lib/constants';
import {
  ActionBadge,
  ActionSelect,
  ItemCard,
  ItemCell,
  NotePanel,
  STICKY,
  cellClass,
} from './ItemEditor';
import type { LineItemColumnDef } from '@/lib/lineItemColumns';

interface ExtractReviewProps {
  extraction: ExtractionResponse;
  minutes: string;
  items: ConfirmLineItem[];
  budget: string;
  columns: LineItemColumnDef[];
  onMinutesChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
  /** Lets the designer change what a row does to the quotation. */
  onChangeAction?: (idx: number, action: ItemAction) => void;
  onUpdateItem: (
    idx: number,
    field: keyof ConfirmLineItem,
    value: string | number | null
  ) => void;
  onUpdateItemExtra: (
    idx: number,
    key: string,
    value: string | number | null
  ) => void;
}

/** Fallback review step: fix minutes, budget and rows before saving. */
export function ExtractReview({
  extraction,
  minutes: editedMinutes,
  items: editedItems,
  budget,
  columns,
  onMinutesChange,
  onBudgetChange,
  onAddItem,
  onRemoveItem,
  onChangeAction,
  onUpdateItem,
  onUpdateItemExtra,
}: ExtractReviewProps) {
  const enabledCols = columns.filter((c) => c.enabled);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 rounded-xl bg-primary-50/60 px-4 py-3 text-xs text-dark-500 dark:bg-dark-900/60 dark:text-dark-400">
        {extraction.scope.total_items > 0 && (
          <span
            title={
              extraction.scope.matched_rooms.length > 0
                ? `Rooms recognised: ${extraction.scope.matched_rooms.join(', ')}`
                : 'No existing room was recognised in this text'
            }
          >
            Context:{' '}
            <strong>
              {extraction.scope.items_in_context}/{extraction.scope.total_items}
            </strong>{' '}
            existing items
          </span>
        )}
      </div>

      <NotePanel
        title="Not turned into line items — review these"
        notes={extraction.unmapped_notes}
        tone="amber"
      />
      <NotePanel
        title="Adjusted automatically before showing you these rows"
        notes={extraction.warnings}
        tone="slate"
      />

      <div className="space-y-2">
        <label
          htmlFor="meeting-minutes"
          className="text-sm font-medium text-dark-900 dark:text-white"
        >
          Meeting Minutes
        </label>
        <textarea
          id="meeting-minutes"
          value={editedMinutes}
          onChange={(e) => onMinutesChange(e.target.value)}
          rows={6}
          className={INPUT_CLS}
          placeholder="One bullet per line..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-dark-900 dark:text-white">
            Extracted line items ({editedItems.length})
          </span>
          <button type="button" onClick={onAddItem} className="link-action">
            + Add row
          </button>
        </div>
        {/* Phones: one card per row */}
        <ul className="space-y-3 md:hidden">
          {editedItems.map((item, idx) => (
            <ItemCard
              key={idx}
              item={item}
              index={idx}
              cols={enabledCols}
              allCols={columns}
              onRemove={() => onRemoveItem(idx)}
              onActionChange={
                onChangeAction ? (a) => onChangeAction(idx, a) : undefined
              }
              onChange={(key, value, isCustom) =>
                isCustom
                  ? onUpdateItemExtra(idx, key, value)
                  : onUpdateItem(idx, key as keyof ConfirmLineItem, value)
              }
            />
          ))}
          {editedItems.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-dark-500 dark:border-line dark:text-dark-400">
              No line items extracted. Save anyway to keep the minutes, or tap{' '}
              <strong>Add row</strong>.
            </li>
          )}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl bg-surface-2 md:block">
          <table className="data-table w-max [&_td]:!py-0.5">
            <thead>
              <tr>
                {['Action', ...enabledCols.map(columnLabel), ''].map((h, i) => (
                  <th
                    key={i}
                    className={
                      i === 0
                        ? `w-24 min-w-24`
                        : enabledCols[i - 1]?.key === 'room'
                          ? `${STICKY} left-0`
                          : ''
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line">
              {editedItems.map((item, idx) => {
                const missing = missingRequiredFields(item, columns).length > 0;
                return (
                  <tr
                    key={idx}
                    className={missing ? 'bg-red-50 dark:bg-red-900/10' : ''}
                  >
                    <td className={`w-24 min-w-24 px-2 py-1`}>
                      {onChangeAction ? (
                        <ActionSelect
                          action={item.action}
                          targetSummary={item.target_summary}
                          index={idx}
                          onChange={(a) => onChangeAction(idx, a)}
                        />
                      ) : (
                        <ActionBadge
                          action={item.action}
                          targetSummary={item.target_summary}
                        />
                      )}
                    </td>
                    {enabledCols.map((col) => (
                      <td
                        key={col.key}
                        className={`px-2 py-1 ${cellClass(col)} ${col.key === 'room' ? `${STICKY} left-0` : ''}`}
                      >
                        <ItemCell
                          col={col}
                          item={item}
                          onChange={(key, value, isCustom) =>
                            isCustom
                              ? onUpdateItemExtra(idx, key, value)
                              : onUpdateItem(
                                  idx,
                                  key as keyof ConfirmLineItem,
                                  value
                                )
                          }
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <button
                        onClick={() => onRemoveItem(idx)}
                        aria-label={`Remove row ${idx + 1}`}
                        type="button"
                        className="icon-btn icon-btn-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {editedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={enabledCols.length + 2}
                    className="py-6 text-center text-dark-500 dark:text-dark-400"
                  >
                    No line items extracted. Save anyway to keep the minutes, or
                    use <strong>+ Add row</strong>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {extraction.material_hints.length > 0 && (
        <details className="rounded-xl bg-surface-2">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark-700 dark:text-dark-300">
            Rate Hints from Materials Catalogue (
            {extraction.material_hints.length})
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-dark-500 dark:text-dark-400">
                  <th className="py-1 text-left">Name</th>
                  <th className="py-1 text-left">Category</th>
                  <th className="py-1 text-left">Unit</th>
                  <th className="py-1 text-right">Rate (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-line">
                {extraction.material_hints.map((h, i) => (
                  <tr key={i}>
                    <td className="py-1">{h.name}</td>
                    <td className="py-1 text-dark-500 dark:text-dark-400">
                      {h.category}
                    </td>
                    <td className="py-1">{h.unit}</td>
                    <td className="py-1 text-right">
                      ₹{h.unit_cost.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 dark:border-line sm:gap-4">
        <label
          htmlFor="client-budget"
          className="text-sm text-dark-700 dark:text-dark-300"
        >
          Client Budget (₹)
        </label>
        <input
          id="client-budget"
          type="number"
          value={budget}
          onChange={(e) => onBudgetChange(e.target.value)}
          placeholder="Optional"
          className="min-h-11 w-36 rounded-lg border border-line px-2 py-1 text-sm dark:border-line dark:bg-dark-900/60 dark:text-white"
        />
      </div>
    </div>
  );
}

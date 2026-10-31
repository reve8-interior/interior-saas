'use client';

import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import { columnLabel, missingRequiredFields } from '@/lib/lineItemColumns';
import { LineItemData } from './types';
import {
  ActionBadge,
  ItemCard,
  ItemCell,
  STICKY,
  cellClass,
} from './ItemEditor';

interface ItemsGridProps {
  items: LineItemData[];
  /** Columns shown in the editor. */
  enabledCols: LineItemColumnDef[];
  /** All columns, used to decide which rows are missing mandatory values. */
  columns: LineItemColumnDef[];
  /** Rows already in the quotation are read-only. */
  locked: boolean;
  onChangeField: (
    idx: number,
    key: string,
    value: string | number | null,
    isCustom: boolean
  ) => void;
  onVerify: (idx: number, verified: boolean) => void;
}

/** Extracted rows: stacked cards on phones, an editable table on desktop. */
export function ItemsGrid({
  items,
  enabledCols,
  columns,
  locked,
  onChangeField,
  onVerify,
}: ItemsGridProps) {
  return (
    <>
      {/* Phones: one card per row */}
      <ul
        className={`space-y-3 md:hidden ${locked ? 'pointer-events-none select-none opacity-60' : ''}`}
      >
        {items.map((item, idx) => (
          <ItemCard
            key={idx}
            item={item}
            index={idx}
            cols={enabledCols}
            allCols={columns}
            onVerify={(v) => onVerify(idx, v)}
            onChange={(key, value, isCustom) =>
              onChangeField(idx, key, value, isCustom)
            }
          />
        ))}
      </ul>
      {/* A disabled fieldset locks the inputs but still scrolls sideways. */}
      <fieldset disabled={locked} className="hidden min-w-0 md:block">
        <div
          className={`overflow-x-auto rounded-2xl bg-surface-2 ${locked ? 'opacity-60' : ''}`}
        >
          <table className="data-table w-max [&_td]:!py-0.5">
            <thead>
              <tr>
                {['Verified', 'Action', ...enabledCols.map(columnLabel)].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={
                        i === 0
                          ? `w-16 min-w-16`
                          : i === 1
                            ? `w-24 min-w-24`
                            : enabledCols[i - 2]?.key === 'room'
                              ? `${STICKY} left-0`
                              : ''
                      }
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line">
              {items.map((item, idx) => {
                const rowMissing =
                  item.action !== 'remove' &&
                  missingRequiredFields(item, columns).length > 0;
                return (
                  <tr
                    key={idx}
                    className={
                      rowMissing
                        ? 'bg-red-50/70 dark:bg-red-900/10'
                        : item.verified
                          ? 'bg-green-50/50 dark:bg-green-900/10'
                          : ''
                    }
                  >
                    <td className={`w-16 min-w-16 px-2 py-1 text-center`}>
                      <input
                        type="checkbox"
                        checked={item.verified}
                        onChange={(e) => onVerify(idx, e.target.checked)}
                        aria-label={`Verify row ${idx + 1}`}
                      />
                    </td>
                    <td className={`w-24 min-w-24 px-2 py-1`}>
                      <ActionBadge
                        action={item.action}
                        targetSummary={item.target_summary}
                        agreedPrice={item.agreed_price}
                      />
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
                            onChangeField(idx, key, value, isCustom)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
    </>
  );
}

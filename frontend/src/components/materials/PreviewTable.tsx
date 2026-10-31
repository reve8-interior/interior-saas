'use client';

import { type DraftRow, rowIssues } from '@/lib/materials';
import { X } from 'lucide-react';
import { INPUT_CLS } from '@/lib/constants';
import {
  CATEGORY_LIST,
  UNIT_LIST,
} from '@/components/materials/MaterialFields';

// ── Editable preview table used by Excel + photo tabs ───────────────────────
export function PreviewTable({
  rows,
  onChange,
}: {
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
}) {
  const set = (i: number, k: keyof DraftRow, v: string) =>
    onChange(
      rows.map((r, idx) =>
        idx === i ? { ...r, [k]: k === 'vendor' ? v || null : v } : r
      )
    );
  const invalidCls = '!border-red-500 dark:!border-red-400';

  return (
    <div className="max-h-72 overflow-auto rounded-lg bg-surface-2">
      <table className="data-table">
        <thead className="sticky top-0">
          <tr>
            {['Name', 'Category', 'Unit', 'Unit Cost (₹)', 'Vendor'].map(
              (h) => (
                <th key={h}>{h}</th>
              )
            )}
            <th>
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line dark:divide-line">
          {rows.map((r, i) => {
            const issues = rowIssues(r);
            const n = i + 1;
            return (
              <tr key={i}>
                <td className="px-2 py-1">
                  <input
                    value={r.name}
                    onChange={(e) => set(i, 'name', e.target.value)}
                    aria-label={`Row ${n} name`}
                    aria-invalid={issues.name}
                    placeholder={issues.name ? 'Name required' : undefined}
                    className={`${INPUT_CLS} ${issues.name ? invalidCls : ''}`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={r.category}
                    onChange={(e) => set(i, 'category', e.target.value)}
                    aria-label={`Row ${n} category`}
                    list={CATEGORY_LIST}
                    className={INPUT_CLS}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={r.unit}
                    onChange={(e) => set(i, 'unit', e.target.value)}
                    aria-label={`Row ${n} unit`}
                    list={UNIT_LIST}
                    className={INPUT_CLS}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    inputMode="decimal"
                    value={r.unit_cost}
                    onChange={(e) => set(i, 'unit_cost', e.target.value)}
                    aria-label={`Row ${n} unit cost`}
                    aria-invalid={issues.cost}
                    placeholder={issues.cost ? 'Cost required' : undefined}
                    className={`${INPUT_CLS} ${issues.cost ? invalidCls : ''}`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={r.vendor ?? ''}
                    onChange={(e) => set(i, 'vendor', e.target.value)}
                    aria-label={`Row ${n} vendor`}
                    placeholder="optional"
                    className={INPUT_CLS}
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    aria-label={`Remove row ${n}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-xs text-dark-500 dark:text-dark-400"
              >
                No rows — upload a file above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

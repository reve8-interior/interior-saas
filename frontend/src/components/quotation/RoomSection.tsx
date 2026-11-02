'use client';

import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import type {
  LineItemUpdate,
  QuotationLineItem,
  QuotationRoomGroup,
} from '@/lib/schemas/quotation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { fmtRupees } from '@/lib/format';
import {
  InlineNumberCell,
  InlineStatusSelect,
} from '@/components/quotation/InlineCells';
import {
  STATUS_OPTIONS,
  STATUS_STYLES,
  SourceChip,
} from '@/components/quotation/quotationStyles';

interface RoomSectionProps {
  group: QuotationRoomGroup;
  clientId: string;
  isCollapsed: boolean;
  /** Conversation numbers by checkpoint id, for the source chips. */
  cpNumbers: Record<string, number>;
  showCol: (key: string) => boolean;
  colLabel: (key: string) => string;
  customCols: LineItemColumnDef[];
  deletePending: boolean;
  onToggle: () => void;
  onAddRow: () => void;
  onEdit: (item: QuotationLineItem) => void;
  onDelete: (item: QuotationLineItem) => void;
  quickUpdate: (itemId: string, payload: LineItemUpdate) => void;
}

/** One room of the quotation: header with totals, then its line items. */
export function RoomSection({
  group,
  clientId: id,
  isCollapsed,
  cpNumbers,
  showCol,
  colLabel,
  customCols,
  deletePending,
  onToggle,
  onAddRow,
  onEdit,
  onDelete,
  quickUpdate,
}: RoomSectionProps) {
  const activeItems = group.items.filter((i) => i.status !== 'removed');
  const agreedCount = group.items.filter((i) => i.status === 'agreed').length;
  const savings = group.initial_total - group.negotiated_total;
  const savingsPct =
    group.initial_total > 0
      ? ((savings / group.initial_total) * 100).toFixed(1)
      : null;
  return (
    <div className="surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className={`flex w-full items-center justify-between gap-2 bg-primary-50/70 px-3 py-3 text-left dark:bg-white/[0.03] sm:px-4 ${!isCollapsed ? 'border-b border-line dark:border-line' : ''}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-dark-500 dark:text-dark-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-dark-500 dark:text-dark-400" />
          )}
          <h2 className="truncate text-sm font-extrabold tracking-tight text-dark-900 dark:text-white">
            {group.room}
          </h2>
          {group.pending_clarity_count > 0 && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          )}
        </div>
        {/* On mobile only item count + negotiated total are shown */}
        <div className="flex shrink-0 items-center gap-2 text-xs sm:gap-4">
          {isCollapsed ? (
            <>
              <span className="text-dark-500 dark:text-dark-400">
                {activeItems.length} items
              </span>
              {agreedCount > 0 && (
                <span className="hidden rounded-control bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 sm:inline-block">
                  {agreedCount} agreed
                </span>
              )}
              {group.pending_clarity_count > 0 && (
                <span className="rounded-control bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {group.pending_clarity_count} unclear
                </span>
              )}
              {savings > 0 && savingsPct && (
                <span className="hidden font-medium text-green-600 dark:text-green-400 sm:inline">
                  −{savingsPct}% saved
                </span>
              )}
              <span className="hidden text-dark-500 dark:text-dark-400 md:inline">
                Initial:{' '}
                <span className="font-semibold text-dark-800 dark:text-dark-200">
                  {fmtRupees(group.initial_total)}
                </span>
              </span>
              <span className="text-dark-500 dark:text-dark-400">
                <span className="hidden sm:inline">Negotiated: </span>
                <span className="font-semibold text-dark-800 dark:text-dark-200">
                  {fmtRupees(group.negotiated_total)}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="hidden text-dark-500 dark:text-dark-400 sm:inline">
                Initial:{' '}
                <span className="font-semibold text-dark-800 dark:text-dark-200">
                  {fmtRupees(group.initial_total)}
                </span>
              </span>
              <span className="text-dark-500 dark:text-dark-400">
                <span className="hidden sm:inline">Negotiated: </span>
                <span className="font-semibold text-dark-800 dark:text-dark-200">
                  {fmtRupees(group.negotiated_total)}
                </span>
              </span>
            </>
          )}
        </div>
      </button>
      {!isCollapsed && (
        <div>
          {/* Phones: one card per line item */}
          <ul className="space-y-3 p-3 md:hidden">
            {group.items.map((item) => (
              <li
                key={item.id}
                data-line-id={item.id}
                className={`rounded-2xl border border-line bg-surface p-3.5 dark:border-line dark:bg-white/[0.03] ${
                  item.status === 'removed' ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`font-bold leading-snug text-dark-900 dark:text-white ${
                        item.status === 'removed' ? 'line-through' : ''
                      }`}
                    >
                      {item.description}
                    </p>
                    <SourceChip clientId={id} item={item} numbers={cpNumbers} />
                    <InlineStatusSelect
                      value={item.status}
                      options={STATUS_OPTIONS}
                      label={`Status of ${item.description}`}
                      className={`mt-1.5 ${STATUS_STYLES[item.status]}`}
                      onChange={(status) => quickUpdate(item.id, { status })}
                    />
                  </div>
                  <div className="-mr-2 -mt-1 flex shrink-0 items-center">
                    <button
                      onClick={() => onEdit(item)}
                      aria-label={`Edit ${item.description}`}
                      className="icon-btn"
                    >
                      <Pencil className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      disabled={deletePending}
                      aria-label={`Delete ${item.description}`}
                      className="icon-btn icon-btn-danger"
                    >
                      <Trash2 className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 dark:border-line">
                  <div>
                    <p className="field-label">Initial</p>
                    <p className="font-bold tabular-nums text-dark-900 dark:text-white">
                      {fmtRupees(item.initial_price)}
                    </p>
                  </div>
                  <div>
                    <p className="field-label">Negotiated</p>
                    <InlineNumberCell
                      value={item.negotiated_price}
                      label={`Negotiated price for ${item.description}`}
                      display={fmtRupees(item.negotiated_price)}
                      onSave={(negotiated_price) =>
                        quickUpdate(item.id, { negotiated_price })
                      }
                    />
                  </div>
                  {showCol('unit') && (
                    <div>
                      <p className="field-label">{colLabel('unit')}</p>
                      <p className="text-dark-700 dark:text-dark-200">
                        {item.unit}
                      </p>
                    </div>
                  )}
                  {showCol('raw_dimension') && (
                    <div>
                      <p className="field-label">{colLabel('raw_dimension')}</p>
                      <p className="text-dark-700 dark:text-dark-200">
                        {item.raw_dimension
                          ? `${item.raw_dimension}${item.computed_sqft != null ? ` (${item.computed_sqft} sqft)` : ''}`
                          : '—'}
                      </p>
                    </div>
                  )}
                  {showCol('qty') && (
                    <div>
                      <p className="field-label">{colLabel('qty')}</p>
                      <InlineNumberCell
                        value={item.qty}
                        label={`Qty for ${item.description}`}
                        display={String(item.qty ?? '—')}
                        onSave={(qty) => quickUpdate(item.id, { qty })}
                      />
                    </div>
                  )}
                  {showCol('rate') && (
                    <div>
                      <p className="field-label">{colLabel('rate')}</p>
                      <InlineNumberCell
                        value={item.rate}
                        label={`Rate for ${item.description}`}
                        display={fmtRupees(item.rate)}
                        onSave={(rate) => quickUpdate(item.id, { rate })}
                      />
                    </div>
                  )}
                  {showCol('est_time') && (
                    <div>
                      <p className="field-label">{colLabel('est_time')}</p>
                      <p className="text-dark-700 dark:text-dark-200">
                        {item.est_time ?? '—'}
                      </p>
                    </div>
                  )}
                  {customCols.map((c) => (
                    <div key={c.key}>
                      <p className="field-label">{c.label}</p>
                      <p className="text-dark-700 dark:text-dark-200">
                        {item.extra?.[c.key] ?? '—'}
                      </p>
                    </div>
                  ))}
                  {showCol('remarks') && item.remarks && (
                    <div className="col-span-2">
                      <p className="field-label">{colLabel('remarks')}</p>
                      <p className="text-dark-600 dark:text-dark-300">
                        {item.remarks}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    colLabel('description'),
                    ...(showCol('unit') ? [colLabel('unit')] : []),
                    ...(showCol('raw_dimension')
                      ? [colLabel('raw_dimension')]
                      : []),
                    ...(showCol('qty') ? [colLabel('qty')] : []),
                    ...(showCol('rate') ? [colLabel('rate')] : []),
                    'Initial (₹)',
                    'Negotiated (₹)',
                    ...(showCol('est_time') ? [colLabel('est_time')] : []),
                    ...customCols.map((c) => c.label),
                    'Status',
                    ...(showCol('remarks') ? [colLabel('remarks')] : []),
                    '',
                  ].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr
                    key={item.id}
                    data-line-id={item.id}
                    className={`hover:bg-primary-50/70 dark:hover:bg-white/[0.06] ${
                      item.status === 'removed'
                        ? 'opacity-50 [&_td]:line-through'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                      {item.description}
                      <SourceChip
                        clientId={id}
                        item={item}
                        numbers={cpNumbers}
                      />
                    </td>
                    {showCol('unit') && (
                      <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                        {item.unit}
                      </td>
                    )}
                    {showCol('raw_dimension') && (
                      <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                        {item.raw_dimension ? (
                          <span>
                            {item.raw_dimension}
                            {item.computed_sqft != null && (
                              <span className="text-dark-500 dark:text-dark-400">
                                {' '}
                                ({item.computed_sqft} sqft)
                              </span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {showCol('qty') && (
                      <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                        <InlineNumberCell
                          value={item.qty}
                          label={`Qty for ${item.description}`}
                          display={String(item.qty ?? '—')}
                          onSave={(qty) => quickUpdate(item.id, { qty })}
                        />
                      </td>
                    )}
                    {showCol('rate') && (
                      <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                        <InlineNumberCell
                          value={item.rate}
                          label={`Rate for ${item.description}`}
                          display={fmtRupees(item.rate)}
                          onSave={(rate) => quickUpdate(item.id, { rate })}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                      {fmtRupees(item.initial_price)}
                    </td>
                    <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                      <InlineNumberCell
                        value={item.negotiated_price}
                        label={`Negotiated price for ${item.description}`}
                        display={fmtRupees(item.negotiated_price)}
                        onSave={(negotiated_price) =>
                          quickUpdate(item.id, { negotiated_price })
                        }
                      />
                    </td>
                    {showCol('est_time') && (
                      <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                        {item.est_time ?? '—'}
                      </td>
                    )}
                    {customCols.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 py-2 text-dark-600 dark:text-dark-300"
                      >
                        {item.extra?.[c.key] ?? '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <InlineStatusSelect
                        value={item.status}
                        options={STATUS_OPTIONS}
                        label={`Status of ${item.description}`}
                        className={STATUS_STYLES[item.status]}
                        onChange={(status) => quickUpdate(item.id, { status })}
                      />
                    </td>
                    {showCol('remarks') && (
                      <td className="max-w-[200px] px-3 py-2 text-dark-500 dark:text-dark-400">
                        <span
                          className="line-clamp-2"
                          title={item.remarks ?? ''}
                        >
                          {item.remarks ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(item)}
                          className="icon-btn"
                          aria-label={`Edit ${item.description}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(item)}
                          disabled={deletePending}
                          className="icon-btn icon-btn-danger"
                          aria-label={`Delete ${item.description}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => {
              onAddRow();
            }}
            className="flex min-h-11 w-full items-center gap-1.5 border-t border-line px-4 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50/70 dark:border-line dark:text-primary-400 dark:hover:bg-white/[0.06]"
          >
            <Plus className="h-3.5 w-3.5" /> Add row
          </button>
        </div>
      )}
    </div>
  );
}

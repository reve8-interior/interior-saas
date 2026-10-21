'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Minus, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fmtDateShort, fmtRate } from '@/lib/format';
import { getQuotation } from '@/lib/quotation';
import {
  COMPARE_FIELD_LABELS,
  compareItems,
  fieldValue,
  type CompareField,
  type CompareRow,
  type CompareStatus,
} from '@/lib/quotationCompare';
import { getQuotationVersion } from '@/lib/quotationVersions';
import type { Quotation, QuotationLineItem } from '@/lib/schemas/quotation';
import type {
  QuotationVersion,
  QuotationVersionSummary,
} from '@/lib/schemas/quotationVersion';

/** Select value for the live, not-yet-saved quotation. */
export const CURRENT = 'current';

/** Each status gets an icon and a word, so colour is never the only cue. */
const STATUS_META: Record<
  Exclude<CompareStatus, 'same'>,
  { label: string; icon: typeof Plus; chip: string; row: string; edge: string }
> = {
  added: {
    label: 'Added',
    icon: Plus,
    chip: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    row: 'bg-green-50/70 dark:bg-green-500/[0.07]',
    edge: 'border-l-green-500',
  },
  removed: {
    label: 'Removed',
    icon: Minus,
    chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    row: 'bg-red-50/70 dark:bg-red-500/[0.07]',
    edge: 'border-l-red-500',
  },
  changed: {
    label: 'Changed',
    icon: Pencil,
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    row: '',
    edge: 'border-l-amber-500',
  },
};

const fmtField = (item: QuotationLineItem | null, field: CompareField) => {
  if (!item) return '';
  const v = fieldValue(item, field);
  if (v === null || v === '') return '—';
  if (field === 'rate' || field === 'amount') return fmtRate(v);
  return String(v);
};

function useSide(
  clientId: string,
  value: string
): { items: QuotationLineItem[] | null } {
  const isCurrent = value === CURRENT;
  const { data: quotation } = useQuery<Quotation>({
    queryKey: ['quotation', clientId],
    queryFn: () => getQuotation(clientId),
    enabled: isCurrent,
  });
  const { data: version } = useQuery<QuotationVersion>({
    queryKey: ['quotation-version', value],
    queryFn: () => getQuotationVersion(value),
    enabled: !isCurrent && value !== '',
  });
  if (isCurrent) {
    return { items: quotation?.rooms.flatMap((r) => r.items) ?? null };
  }
  return { items: version?.line_items ?? null };
}

function SidePicker({
  label,
  value,
  onChange,
  versions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  versions: QuotationVersionSummary[];
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="field-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field min-h-11 w-full"
      >
        <option value={CURRENT}>Current quotation (not saved)</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            Version {v.number}
            {v.label ? ` · ${v.label}` : ''} · {fmtDateShort(v.created_at)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Cell({
  row,
  field,
  side,
  divider,
}: {
  row: CompareRow;
  field: CompareField;
  side: 'before' | 'after';
  divider: boolean;
}) {
  const item = row[side];
  const changed = row.changedFields.includes(field);
  const text = fmtField(item, field);
  // Unit is shown inside the Qty cell, so a unit change highlights Qty too.
  const unit =
    field === 'qty' && item && item.qty !== null ? ` ${item.unit}` : '';
  return (
    <td
      className={`whitespace-nowrap text-right tabular-nums ${
        divider ? 'border-l border-line dark:border-primary-300/15' : ''
      } ${
        field === 'amount' ? 'font-medium text-dark-900 dark:text-white' : ''
      } ${
        changed
          ? 'bg-amber-100/80 font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200'
          : ''
      } ${row.status === 'removed' && side === 'before' ? 'line-through decoration-red-400/70' : ''}`}
    >
      {text}
      {text !== '' && text !== '—' ? unit : ''}
    </td>
  );
}

function RoomTable({
  room,
  rows,
  beforeTotal,
  afterTotal,
  fromTitle,
  toTitle,
}: {
  room: string;
  rows: CompareRow[];
  beforeTotal: number;
  afterTotal: number;
  fromTitle: string;
  toTitle: string;
}) {
  const delta = afterTotal - beforeTotal;
  // Unit lives in the Qty cell, so it needs no column of its own.
  const cols: CompareField[] = ['raw_dimension', 'qty', 'rate', 'amount'];
  return (
    <section className="surface overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-primary-50/70 px-4 py-3 dark:border-primary-300/15 dark:bg-white/[0.03]">
        <h3 className="text-sm font-extrabold tracking-tight text-dark-900 dark:text-white">
          {room}
        </h3>
        <p className="text-xs tabular-nums text-dark-600 dark:text-dark-300">
          {fmtRate(beforeTotal)} → {fmtRate(afterTotal)}
          {delta !== 0 && (
            <span
              className={`ml-2 font-semibold ${
                delta > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-green-700 dark:text-green-300'
              }`}
            >
              {delta > 0 ? '+' : '−'}
              {fmtRate(Math.abs(delta))}
            </span>
          )}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="data-table w-max min-w-full">
          <thead>
            <tr>
              <th rowSpan={2} className="min-w-52 align-bottom">
                Item
              </th>
              <th
                colSpan={cols.length}
                className="border-l border-line text-center dark:border-primary-300/15"
              >
                {fromTitle}
              </th>
              <th
                colSpan={cols.length}
                className="border-l border-line text-center dark:border-primary-300/15"
              >
                {toTitle}
              </th>
            </tr>
            <tr>
              {(['before', 'after'] as const).flatMap((side) =>
                cols.map((f, i) => (
                  <th
                    key={`${side}-${f}`}
                    className={`text-right ${
                      i === 0
                        ? 'border-l border-line dark:border-primary-300/15'
                        : ''
                    }`}
                  >
                    {COMPARE_FIELD_LABELS[f]}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta =
                row.status === 'same' ? null : STATUS_META[row.status];
              const Icon = meta?.icon;
              return (
                <tr
                  key={`${row.description}-${row.status}-${row.after?.id ?? row.before?.id}`}
                  className={`border-l-4 ${meta ? `${meta.row} ${meta.edge}` : 'border-l-transparent'}`}
                >
                  <td className="min-w-52">
                    <div className="flex items-start gap-2">
                      {meta && Icon ? (
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                          {meta.label}
                        </span>
                      ) : null}
                      <span
                        className={`font-medium ${
                          row.status === 'removed'
                            ? 'text-dark-500 line-through dark:text-dark-400'
                            : 'text-dark-900 dark:text-white'
                        }`}
                      >
                        {row.description}
                      </span>
                    </div>
                  </td>
                  {(['before', 'after'] as const).flatMap((side) =>
                    cols.map((f, i) => (
                      <Cell
                        key={`${side}-${f}`}
                        row={row}
                        field={f}
                        side={side}
                        divider={i === 0}
                      />
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  status,
  count,
}: {
  status: Exclude<CompareStatus, 'same'>;
  count: number;
}) {
  const { label, icon: Icon, chip } = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${count === 0 ? 'bg-primary-100/60 text-dark-500 dark:bg-white/5 dark:text-dark-400' : chip}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {count} {label.toLowerCase()}
    </span>
  );
}

/**
 * Side-by-side comparison of two quotation versions (or one version and the
 * live quotation), with the same added / removed / changed cues used across
 * the app.
 */
export function VersionCompare({
  clientId,
  versions,
  from,
  to,
  onChange,
}: {
  clientId: string;
  versions: QuotationVersionSummary[];
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [changedOnly, setChangedOnly] = useState(true);
  const a = useSide(clientId, from);
  const b = useSide(clientId, to);

  const titleOf = (value: string) => {
    if (value === CURRENT) return 'Current';
    const v = versions.find((x) => x.id === value);
    return v ? `Version ${v.number}` : '';
  };

  const result = useMemo(
    () => (a.items && b.items ? compareItems(a.items, b.items) : null),
    [a.items, b.items]
  );

  const delta = result ? result.afterTotal - result.beforeTotal : 0;
  const rooms = result
    ? result.rooms
        .map((r) => ({
          ...r,
          rows: changedOnly
            ? r.rows.filter((x) => x.status !== 'same')
            : r.rows,
        }))
        .filter((r) => r.rows.length > 0)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SidePicker
          label="Compare"
          value={from}
          onChange={(v) => onChange(v, to)}
          versions={versions}
        />
        <button
          type="button"
          onClick={() => onChange(to, from)}
          aria-label="Swap versions"
          className="btn-secondary min-h-11 self-start sm:self-auto"
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          <span className="sm:hidden">Swap</span>
        </button>
        <SidePicker
          label="With"
          value={to}
          onChange={(v) => onChange(from, v)}
          versions={versions}
        />
      </div>

      {from === to ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
          Pick two different versions to compare.
        </p>
      ) : !result ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
      ) : (
        <>
          <div
            className="surface flex flex-wrap items-center gap-x-6 gap-y-3 p-4"
            aria-live="polite"
          >
            <div className="flex flex-wrap gap-2">
              <Stat status="added" count={result.counts.added} />
              <Stat status="changed" count={result.counts.changed} />
              <Stat status="removed" count={result.counts.removed} />
              <span className="inline-flex items-center px-1 text-sm text-dark-500 dark:text-dark-400">
                {result.counts.same} unchanged
              </span>
            </div>
            <div className="ml-auto text-right">
              <p className="field-label">Total</p>
              <p className="font-heading text-lg font-bold tabular-nums text-dark-900 dark:text-white">
                {fmtRate(result.beforeTotal)} → {fmtRate(result.afterTotal)}
                {delta !== 0 && (
                  <span
                    className={`ml-2 text-sm ${
                      delta > 0
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-green-700 dark:text-green-300'
                    }`}
                  >
                    {delta > 0 ? '+' : '−'}
                    {fmtRate(Math.abs(delta))}
                  </span>
                )}
              </p>
            </div>
          </div>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-dark-700 dark:text-dark-200">
            <input
              type="checkbox"
              checked={changedOnly}
              onChange={(e) => setChangedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Show only what changed
          </label>

          {rooms.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
              These two are identical.
            </p>
          ) : (
            rooms.map((r) => (
              <RoomTable
                key={r.room}
                room={r.room}
                rows={r.rows}
                beforeTotal={r.beforeTotal}
                afterTotal={r.afterTotal}
                fromTitle={titleOf(from)}
                toTitle={titleOf(to)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

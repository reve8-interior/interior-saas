'use client';

import { BlockSkeleton } from '@/components/ui';
import {
  createLineItem,
  createQuotation,
  deleteLineItem,
  getQuotation,
  getMaterials,
  updateLineItem,
  type Material,
} from '@/lib/quotation';
import type {
  LineItemCreate,
  LineItemStatus,
  LineItemUpdate,
  Quotation,
  QuotationDerivedState,
  QuotationLineItem,
} from '@/lib/schemas/quotation';
import {
  type LineItemColumnDef,
  useLineItemColumns,
} from '@/lib/lineItemColumns';
import { listQuotationVersions } from '@/lib/quotationVersions';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';
import { SimpleModal } from '@/components/shared/SimpleModal';
import { ApiError } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBarActions } from '@/components/layout/TopBarActions';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  History,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CARD_CLS, INPUT_CLS } from '@/lib/constants';
import { fmtRupees } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';

const STATE_LABELS: Record<QuotationDerivedState, string> = {
  draft: 'Draft',
  in_negotiation: 'In Negotiation',
  clarification_needed: 'Clarification Needed',
  ready_for_approval: 'Ready for Approval',
};

const STATE_STYLES: Record<QuotationDerivedState, string> = {
  draft: 'bg-primary-100/70 text-gray-700 dark:bg-white/10 dark:text-dark-300',
  in_negotiation:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  clarification_needed:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ready_for_approval:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_STYLES: Record<LineItemStatus, string> = {
  draft: 'bg-primary-100/70 text-gray-600 dark:bg-white/10 dark:text-dark-300',
  priced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending_clarity:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  agreed:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  removed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_OPTIONS: LineItemStatus[] = [
  'draft',
  'priced',
  'pending_clarity',
  'agreed',
  'removed',
];

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'dimension', 'lumpsum'];

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addToRoom, setAddToRoom] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuotationLineItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuotationLineItem | null>(
    null
  );
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());

  const { columns } = useLineItemColumns();
  const showCol = (key: string) =>
    columns.some((c) => c.key === key && c.enabled);
  const customCols = columns.filter((c) => c.enabled && !c.builtin);
  const colLabel = (key: string) =>
    columns.find((c) => c.key === key)?.label ?? key;

  const { data: versions = [] } = useQuery<QuotationVersionSummary[]>({
    queryKey: ['quotation-versions', id],
    queryFn: () => listQuotationVersions(id),
  });
  const latestVersion = versions[0];

  const {
    data: quotation,
    isLoading,
    error,
  } = useQuery<Quotation, ApiError>({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id),
    retry: false,
  });

  const noQuotationYet = error instanceof ApiError && error.status === 404;

  const existingRooms = useMemo(
    () => (quotation ? quotation.rooms.map((r) => r.room) : []),
    [quotation]
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['quotation', id] });

  const createQuotationMutation = useMutation({
    mutationFn: () => createQuotation(id),
    onSuccess: () => {
      invalidate();
      toast.success('Quotation created — add line items');
    },
    onError: (e: Error) =>
      toast.error(e.message || 'Failed to create quotation'),
  });

  const createItemMutation = useMutation({
    mutationFn: (payload: LineItemCreate) =>
      createLineItem(quotation!.id, payload),
    onSuccess: (item) => {
      invalidate();
      setShowAdd(false);
      if (item.status === 'pending_clarity') {
        toast.warning('Item added but flagged: dimension needs clarification');
      } else {
        toast.success('Line item added');
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add item'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: LineItemUpdate;
    }) => updateLineItem(quotation!.id, itemId, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Line item updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteLineItem(quotation!.id, itemId),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      toast.success('Line item deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete item'),
  });

  const savings =
    quotation != null
      ? quotation.initial_total - quotation.negotiated_total
      : null;

  const roomNames = quotation?.rooms.map((r) => r.room) ?? [];
  const allCollapsed =
    roomNames.length > 0 && roomNames.every((r) => collapsedRooms.has(r));

  const toggleRoom = (room: string) =>
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      next.has(room) ? next.delete(room) : next.add(room);
      return next;
    });

  const toggleAll = () =>
    setCollapsedRooms(allCollapsed ? new Set() : new Set(roomNames));

  return (
    <div className="space-y-6">
      {quotation && (
        <TopBarActions>
          {roomNames.length > 0 && (
            <button type="button" onClick={toggleAll} className="btn-secondary">
              {allCollapsed ? (
                <ChevronsUpDown className="h-4 w-4" />
              ) : (
                <ChevronsDownUp className="h-4 w-4" />
              )}
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          <Link
            href={`/dashboard/clients/${id}/versions?new=1`}
            className="btn-primary"
          >
            <History className="h-4 w-4" /> Save version
          </Link>
        </TopBarActions>
      )}

      {isLoading && <BlockSkeleton />}

      {noQuotationYet && (
        <EmptyState
          action={
            <button
              onClick={() => createQuotationMutation.mutate()}
              disabled={createQuotationMutation.isPending}
              className="btn-primary"
            >
              {createQuotationMutation.isPending
                ? 'Creating…'
                : 'Create Quotation'}
            </button>
          }
        >
          No quotation yet for this client.
        </EmptyState>
      )}

      {quotation && (
        <>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span
              className={`badge !px-3 !py-1 !text-sm ${
                quotation.status === 'approved'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : STATE_STYLES[quotation.derived_state]
              }`}
            >
              {quotation.status === 'approved'
                ? 'Approved'
                : STATE_LABELS[quotation.derived_state]}
            </span>
            <Link
              href={`/dashboard/clients/${id}/versions`}
              className="badge bg-primary-100 !px-3 !py-1 !text-sm text-primary-700 hover:bg-primary-200/70 dark:bg-primary-900/30 dark:text-primary-400"
            >
              {latestVersion
                ? `Last saved: Version ${latestVersion.number}`
                : 'Not saved as a version yet'}
            </Link>
            {quotation.pending_clarity_count > 0 && (
              <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {quotation.pending_clarity_count} item
                {quotation.pending_clarity_count > 1 ? 's' : ''} awaiting
                clarity
              </span>
            )}
            <span className="text-xs text-dark-500 dark:text-dark-400">
              {new Date(quotation.created_at).toLocaleString()}
            </span>
          </div>

          {/* Three compact summary cards, larger from sm up */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className={`${CARD_CLS} !p-3 text-center sm:!p-4`}>
              <p className="field-label">Initial Quote</p>
              <p className="text-base font-extrabold tabular-nums tracking-tight text-dark-900 dark:text-white sm:text-2xl">
                {fmtRupees(quotation.initial_total)}
              </p>
            </div>
            <div className={`${CARD_CLS} !p-3 text-center sm:!p-4`}>
              <p className="field-label">Negotiated Offer</p>
              <p className="text-base font-extrabold tabular-nums tracking-tight text-dark-900 dark:text-white sm:text-2xl">
                {fmtRupees(quotation.negotiated_total)}
              </p>
            </div>
            <div className={`${CARD_CLS} !p-3 text-center sm:!p-4`}>
              <p className="field-label">Difference</p>
              <p
                className={`text-base font-extrabold tabular-nums tracking-tight sm:text-2xl ${
                  savings != null && savings > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-dark-900 dark:text-white'
                }`}
              >
                {savings != null && savings > 0
                  ? `− ${fmtRupees(savings)}`
                  : fmtRupees(0)}
              </p>
            </div>
          </div>

          {quotation.rooms.length === 0 && (
            <EmptyState
              action={
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="btn-primary"
                >
                  + Add line item
                </button>
              }
            >
              No line items yet. Add one by hand, or extract rows from meeting
              notes in Conversations.
            </EmptyState>
          )}

          {quotation.rooms.map((group) => {
            const isCollapsed = collapsedRooms.has(group.room);
            const activeItems = group.items.filter(
              (i) => i.status !== 'removed'
            );
            const agreedCount = group.items.filter(
              (i) => i.status === 'agreed'
            ).length;
            const savings = group.initial_total - group.negotiated_total;
            const savingsPct =
              group.initial_total > 0
                ? ((savings / group.initial_total) * 100).toFixed(1)
                : null;
            return (
              <div key={group.room} className="surface overflow-hidden">
                <button
                  onClick={() => toggleRoom(group.room)}
                  className={`flex w-full items-center justify-between gap-2 bg-primary-50/70 px-3 py-3 text-left dark:bg-white/[0.03] sm:px-4 ${!isCollapsed ? 'border-b border-line dark:border-primary-300/15' : ''}`}
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
                          <span className="hidden rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 sm:inline-block">
                            {agreedCount} agreed
                          </span>
                        )}
                        {group.pending_clarity_count > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
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
                          className={`rounded-2xl border border-line bg-white/70 p-3.5 dark:border-primary-300/15 dark:bg-white/[0.03] ${
                            item.status === 'removed' ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={`font-bold leading-snug text-dark-900 dark:text-white ${
                                  item.status === 'removed'
                                    ? 'line-through'
                                    : ''
                                }`}
                              >
                                {item.description}
                              </p>
                              <span
                                className={`badge mt-1.5 ${STATUS_STYLES[item.status]}`}
                              >
                                {item.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="-mr-2 -mt-1 flex shrink-0 items-center">
                              <button
                                onClick={() => setEditing(item)}
                                aria-label={`Edit ${item.description}`}
                                className="flex h-11 w-11 items-center justify-center rounded-full text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10"
                              >
                                <Pencil className="h-[18px] w-[18px]" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(item)}
                                aria-label={`Delete ${item.description}`}
                                className="flex h-11 w-11 items-center justify-center rounded-full text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-[18px] w-[18px]" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 dark:border-primary-300/10">
                            <div>
                              <p className="field-label">Initial</p>
                              <p className="font-bold tabular-nums text-dark-900 dark:text-white">
                                {fmtRupees(item.initial_price)}
                              </p>
                            </div>
                            <div>
                              <p className="field-label">Negotiated</p>
                              <p className="font-bold tabular-nums text-dark-900 dark:text-white">
                                {fmtRupees(item.negotiated_price)}
                              </p>
                            </div>
                            {showCol('unit') && (
                              <div>
                                <p className="field-label">
                                  {colLabel('unit')}
                                </p>
                                <p className="text-dark-700 dark:text-dark-200">
                                  {item.unit}
                                </p>
                              </div>
                            )}
                            {showCol('raw_dimension') && (
                              <div>
                                <p className="field-label">
                                  {colLabel('raw_dimension')}
                                </p>
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
                                <p className="tabular-nums text-dark-700 dark:text-dark-200">
                                  {item.qty ?? '—'}
                                </p>
                              </div>
                            )}
                            {showCol('rate') && (
                              <div>
                                <p className="field-label">
                                  {colLabel('rate')}
                                </p>
                                <p className="tabular-nums text-dark-700 dark:text-dark-200">
                                  {fmtRupees(item.rate)}
                                </p>
                              </div>
                            )}
                            {showCol('est_time') && (
                              <div>
                                <p className="field-label">
                                  {colLabel('est_time')}
                                </p>
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
                                <p className="field-label">
                                  {colLabel('remarks')}
                                </p>
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
                              ...(showCol('est_time')
                                ? [colLabel('est_time')]
                                : []),
                              ...customCols.map((c) => c.label),
                              'Status',
                              ...(showCol('remarks')
                                ? [colLabel('remarks')]
                                : []),
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
                              className={`hover:bg-primary-50/70 dark:hover:bg-white/[0.06] ${
                                item.status === 'removed'
                                  ? 'opacity-50 [&_td]:line-through'
                                  : ''
                              }`}
                            >
                              <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                                {item.description}
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
                                  {item.qty ?? '—'}
                                </td>
                              )}
                              {showCol('rate') && (
                                <td className="px-3 py-2 text-dark-600 dark:text-dark-300">
                                  {fmtRupees(item.rate)}
                                </td>
                              )}
                              <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                                {fmtRupees(item.initial_price)}
                              </td>
                              <td className="px-3 py-2 font-medium text-dark-900 dark:text-white">
                                {fmtRupees(item.negotiated_price)}
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
                                <span
                                  className={`badge ${STATUS_STYLES[item.status]}`}
                                >
                                  {item.status.replace('_', ' ')}
                                </span>
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
                                    onClick={() => setEditing(item)}
                                    className="rounded-full p-2 text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10 dark:hover:text-primary-400"
                                    aria-label={`Edit ${item.description}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(item)}
                                    className="rounded-full p-2 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
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
                        setAddToRoom(group.room);
                        setShowAdd(true);
                      }}
                      className="flex min-h-11 w-full items-center gap-1.5 border-t border-line px-4 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50/70 dark:border-primary-300/15 dark:text-primary-400 dark:hover:bg-white/[0.06]"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add row
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {showAdd && quotation && (
        <LineItemFormModal
          title="Add Line Item"
          rooms={existingRooms}
          customCols={customCols}
          defaultRoom={addToRoom ?? undefined}
          pending={createItemMutation.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={(payload) => createItemMutation.mutate(payload)}
        />
      )}

      {confirmDelete && (
        <SimpleModal
          title="Delete item?"
          onClose={() => setConfirmDelete(null)}
          size="sm"
        >
          <p className="text-sm text-dark-600 dark:text-dark-300">
            Delete{' '}
            <span className="font-semibold text-dark-900 dark:text-white">
              {confirmDelete.description}
            </span>
            ? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteItemMutation.mutate(confirmDelete.id)}
              disabled={deleteItemMutation.isPending}
              className="btn-danger"
            >
              {deleteItemMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </SimpleModal>
      )}

      {editing && quotation && (
        <LineItemFormModal
          title="Edit Line Item"
          rooms={existingRooms}
          customCols={customCols}
          item={editing}
          pending={updateItemMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(payload) =>
            updateItemMutation.mutate({ itemId: editing.id, payload })
          }
        />
      )}
    </div>
  );
}

interface FormState {
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

function LineItemFormModal({
  title,
  rooms,
  customCols,
  item,
  defaultRoom,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  rooms: string[];
  customCols: LineItemColumnDef[];
  item?: QuotationLineItem;
  defaultRoom?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: LineItemCreate & LineItemUpdate) => void;
}) {
  const [form, setForm] = useState<FormState>({
    room: item?.room ?? defaultRoom ?? '',
    description: item?.description ?? '',
    unit: item?.unit ?? 'sqft',
    raw_dimension: item?.raw_dimension ?? '',
    qty: item?.qty != null ? String(item.qty) : '',
    rate: item?.rate != null ? String(item.rate) : '',
    negotiated_price:
      item?.negotiated_price != null ? String(item.negotiated_price) : '',
    est_time: item?.est_time ?? '',
    remarks: item?.remarks ?? '',
    status: item?.status ?? 'draft',
    material_id: item?.material_id ?? '',
  });
  const [extraForm, setExtraForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      customCols.map((c) => [
        c.key,
        item?.extra?.[c.key] != null ? String(item.extra[c.key]) : '',
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => getMaterials(),
  });

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const numOrNull = (v: string): number | null =>
    v.trim() === '' ? null : Number(v);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.room.trim()) return setError('Room is required');
    if (!form.description.trim()) return setError('Description is required');
    for (const [label, v] of [
      ['Qty', form.qty],
      ['Rate', form.rate],
      ['Negotiated price', form.negotiated_price],
    ] as const) {
      if (v.trim() !== '' && (isNaN(Number(v)) || Number(v) < 0)) {
        return setError(`${label} must be a non-negative number`);
      }
    }
    setError(null);

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
    if (item) payload.status = form.status;
    onSubmit(payload);
  };

  return (
    <SimpleModal title={title} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Room *">
            <input
              className={INPUT_CLS}
              list="quotation-rooms"
              value={form.room}
              onChange={(e) => set('room')(e.target.value)}
              placeholder="Living Room"
            />
            <datalist id="quotation-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit *">
            <select
              className={INPUT_CLS}
              value={form.unit}
              onChange={(e) => set('unit')(e.target.value)}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Material (select from library)">
          <select
            className={INPUT_CLS}
            value={form.material_id}
            onChange={(e) => set('material_id')(e.target.value)}
          >
            <option value="">— No material selected —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.category}) — ₹{m.unit_cost.toLocaleString('en-IN')}
                /{m.unit}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description *">
          <input
            className={INPUT_CLS}
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            placeholder="TV Unit Back Panel"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={'Dimension (e.g. 6\'3"x1\'6")'}>
            <input
              className={INPUT_CLS}
              value={form.raw_dimension}
              onChange={(e) => set('raw_dimension')(e.target.value)}
              placeholder={"5'x3'"}
            />
          </Field>
          <Field label="Qty">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.qty}
              onChange={(e) => set('qty')(e.target.value)}
              placeholder="4"
            />
          </Field>
          <Field label="Rate (₹)">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => set('rate')(e.target.value)}
              placeholder="450"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Negotiated Price (₹)">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.negotiated_price}
              onChange={(e) => set('negotiated_price')(e.target.value)}
              placeholder="Leave empty if not renegotiated"
            />
          </Field>
          <Field label="Est. Time">
            <input
              className={INPUT_CLS}
              value={form.est_time}
              onChange={(e) => set('est_time')(e.target.value)}
              placeholder="e.g. 2 weeks"
            />
          </Field>
          {item && (
            <Field label="Status">
              <select
                className={INPUT_CLS}
                value={form.status}
                onChange={(e) =>
                  set('status')(e.target.value as LineItemStatus)
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {customCols.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customCols.map((c) => (
              <Field key={c.key} label={c.required ? `${c.label} *` : c.label}>
                <input
                  className={INPUT_CLS}
                  inputMode={c.type === 'number' ? 'decimal' : undefined}
                  value={extraForm[c.key] ?? ''}
                  onChange={(e) =>
                    setExtraForm((prev) => ({
                      ...prev,
                      [c.key]: e.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        )}

        <Field label="Remarks">
          <textarea
            className={`${INPUT_CLS} min-h-[70px]`}
            value={form.remarks}
            onChange={(e) => set('remarks')(e.target.value)}
            placeholder="e.g. Needs clarity on 3 nos side tables"
          />
        </Field>

        <p className="text-xs text-dark-500 dark:text-dark-500">
          Price is derived automatically: dimension → sqft × rate, or qty ×
          rate. Unreadable dimensions flag the item for clarification.
        </p>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1 max-sm:[&>*]:flex-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </SimpleModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

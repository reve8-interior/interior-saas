'use client';

import { findLineIdByLabel } from '@/lib/quotationMessages';
import { RoomSection } from '@/components/quotation/RoomSection';
import { BlockSkeleton, ErrorState } from '@/components/ui';
import {
  createLineItem,
  reopenQuotation,
  createQuotation,
  deleteLineItem,
  getQuotation,
  updateLineItem,
} from '@/lib/quotation';
import type {
  LineItemCreate,
  LineItemUpdate,
  Quotation,
  QuotationLineItem,
} from '@/lib/schemas/quotation';
import {
  discountPercent,
  lastEdited,
  quotationSavings,
} from '@/lib/lineItemForm';
import { useLineItemColumns } from '@/lib/lineItemColumns';
import {
  listQuotationVersions,
  listVersionShares,
} from '@/lib/quotationVersions';
import { timeAgo } from '@/lib/dates';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';
import { ApiError, api } from '@/lib/api';
import {
  checkpointNumbers,
  type ReviewableCheckpoint,
} from '@/lib/checkpoints';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBarActions } from '@/components/layout/TopBarActions';
import {
  AlertTriangle,
  ChevronsDownUp,
  ChevronsUpDown,
  History,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CARD_CLS } from '@/lib/constants';
import { fmtRupees } from '@/lib/format';
import {
  STATE_LABELS,
  STATE_STYLES,
} from '@/components/quotation/quotationStyles';
import { LineItemFormModal } from '@/components/quotation/LineItemFormModal';
import { SaveVersionModal } from '@/components/quotation/SaveVersionModal';
import { MeetingReviewBanner } from '@/components/quotation/MeetingReviewBanner';
import { AddRowsSheet } from '@/components/quotation/AddRowsSheet';
import { QuotationReviewModal } from '@/components/quotation/QuotationReviewModal';
import { QuotationAddPanel } from '@/components/quotation/QuotationAddPanel';

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [onlyUnclear, setOnlyUnclear] = useState(false);
  const [addToRoom, setAddToRoom] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuotationLineItem | null>(null);
  // Remembered per client for the session so a refresh keeps your place.
  const roomsKey = `quotation-collapsed:${id}`;
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(() => {
    try {
      return new Set<string>(
        JSON.parse(sessionStorage.getItem(roomsKey) ?? '[]')
      );
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(roomsKey, JSON.stringify([...collapsedRooms]));
    } catch {
      // Storage unavailable; collapse state just won't persist.
    }
  }, [roomsKey, collapsedRooms]);

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
  // How the customer has treated the newest version's links.
  const { data: latestShares = [] } = useQuery({
    queryKey: ['quotation-shares', latestVersion?.id],
    queryFn: () => listVersionShares(latestVersion.id),
    enabled: !!latestVersion,
  });
  const views = latestShares.reduce((n, s) => n + s.view_count, 0);
  const lastViewed = latestShares
    .map((s) => s.last_viewed_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const {
    data: quotation,
    isLoading,
    error,
    refetch,
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

  // ?item=<line id> (from a design's hotspot) or ?line=<"Room · description"> (from a
  // customer's question): open its room, scroll to the row, flash it.
  // Read after mount: the server render has no query string.
  const focusDone = useRef(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFocusId(params.get('item'));
    setFocusLine(params.get('line'));
  }, []);
  const targetId =
    focusId ??
    (focusLine && quotation
      ? findLineIdByLabel(quotation.rooms, focusLine)
      : null);
  const focusRoom = quotation?.rooms.find((r) =>
    r.items.some((i) => i.id === targetId)
  )?.room;
  useEffect(() => {
    if (!targetId || !focusRoom || focusDone.current) return;
    if (collapsedRooms.has(focusRoom)) {
      setCollapsedRooms((prev) => {
        const next = new Set(prev);
        next.delete(focusRoom);
        return next;
      });
      return;
    }
    // Phone cards and the desktop table both carry the id; only one is visible.
    const row = [
      ...document.querySelectorAll<HTMLElement>(`[data-line-id="${targetId}"]`),
    ].find((el) => el.offsetParent !== null);
    if (!row) return;
    focusDone.current = true;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('line-flash');
  }, [targetId, focusRoom, collapsedRooms]);

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

  /** The row's updated_at as loaded, so a teammate's newer edit is caught. */
  const stampOf = (itemId: string) =>
    // An open edit form keeps the copy it was opened on, not a later refetch.
    (editing?.id === itemId ? editing.updated_at : undefined) ??
    quotation?.rooms.flatMap((r) => r.items).find((i) => i.id === itemId)
      ?.updated_at;

  // On a conflict the latest rows are reloaded so the retry starts fresh.
  const onEditError = (e: Error) => {
    toast.error(e.message || 'Failed to update item');
    invalidate();
  };

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: LineItemUpdate;
    }) => updateLineItem(quotation!.id, itemId, payload, stampOf(itemId)),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Line item updated');
    },
    onError: (e, variables) => {
      // A rename that matches another line: ask once, then save anyway.
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.message.includes('Add it anyway') &&
        window.confirm(`${e.message}

Save this change anyway?`)
      ) {
        updateItemMutation.mutate({
          ...variables,
          payload: { ...variables.payload, allow_duplicate: true },
        });
        return;
      }
      onEditError(e);
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenQuotation(id),
    onSuccess: () => {
      invalidate();
      toast.success('Quotation reopened for changes');
    },
    onError: onEditError,
  });

  // Single-cell edits from the table: no modal, quiet success, error toast.
  const quickUpdateMutation = useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: LineItemUpdate;
    }) => updateLineItem(quotation!.id, itemId, payload, stampOf(itemId)),
    onSuccess: invalidate,
    onError: onEditError,
  });
  const quickUpdate = (itemId: string, payload: LineItemUpdate) =>
    quickUpdateMutation.mutate({ itemId, payload });

  const restoreItemMutation = useMutation({
    mutationFn: (item: QuotationLineItem) =>
      createLineItem(quotation!.id, {
        room: item.room,
        description: item.description,
        unit: item.unit,
        catalog_type: item.catalog_type,
        position: item.position,
        raw_dimension: item.raw_dimension,
        qty: item.qty,
        rate: item.rate,
        negotiated_price: item.negotiated_price,
        est_time: item.est_time,
        remarks: item.remarks,
        extra: item.extra,
        material_id: item.material_id,
        // Putting back what was there a moment ago is not a new duplicate.
        allow_duplicate: true,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Line item restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to restore item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (item: QuotationLineItem) =>
      deleteLineItem(quotation!.id, item.id, item.updated_at),
    onSuccess: (_, item) => {
      invalidate();
      toast.success(`Deleted “${item.description}”`, {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () => restoreItemMutation.mutate(item),
        },
      });
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to delete item');
      invalidate();
    },
  });

  const savings = quotationSavings(quotation);
  // Totals differ from the newest saved version: worth saving a new one.
  const changedSinceSave =
    !!quotation &&
    !!latestVersion &&
    (Number(latestVersion.negotiated_total) !== quotation.negotiated_total ||
      Number(latestVersion.initial_total) !== quotation.initial_total);

  const { data: checkpoints = [] } = useQuery<ReviewableCheckpoint[]>({
    queryKey: ['checkpoints', id],
    queryFn: () =>
      api.get<ReviewableCheckpoint[]>(`/clients/${id}/checkpoints`),
  });
  const cpNumbers = checkpointNumbers(checkpoints);

  /** Saved notes are reviewed where the source text sits beside the rows. */
  function openSavedNotes(checkpointId: string) {
    qc.invalidateQueries({ queryKey: ['checkpoints', id] });
    toast.success(
      'Notes saved — review the rows, then add them to the quotation'
    );
    router.push(
      `/dashboard/clients/${id}/checkpoints#checkpoint-${checkpointId}`
    );
  }

  const roomNames = quotation?.rooms.map((r) => r.room) ?? [];
  // "Show only these": just the rows that need clarity, rooms expanded.
  // The filter lapses by itself once nothing is unclear.
  const showUnclear =
    onlyUnclear && (quotation?.pending_clarity_count ?? 0) > 0;
  const visibleRooms = (quotation?.rooms ?? [])
    .map((g) =>
      showUnclear
        ? { ...g, items: g.items.filter((i) => i.status === 'pending_clarity') }
        : g
    )
    .filter((g) => !showUnclear || g.items.length > 0);
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
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="btn-secondary"
          >
            <ShieldCheck className="h-4 w-4" /> Review
          </button>
          <button
            type="button"
            onClick={() => setSavingVersion(true)}
            className="btn-primary"
          >
            <History className="h-4 w-4" /> Save version
          </button>
        </TopBarActions>
      )}

      <MeetingReviewBanner clientId={id} checkpoints={checkpoints} />

      {reviewing && (
        <QuotationReviewModal
          clientId={id}
          onClose={() => setReviewing(false)}
        />
      )}

      {isLoading && <BlockSkeleton />}

      {error && !noQuotationYet && (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load the quotation.
        </ErrorState>
      )}

      {noQuotationYet && (
        <QuotationAddPanel
          clientId={id}
          hasRows={false}
          handLabel={
            createQuotationMutation.isPending ? 'Creating…' : 'Add rows by hand'
          }
          handDisabled={createQuotationMutation.isPending}
          onAddByHand={() =>
            createQuotationMutation.mutate(undefined, {
              onSuccess: () => setShowAdd(true),
            })
          }
          onNotesSaved={openSavedNotes}
        />
      )}

      {quotation && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
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
            {quotation.status === 'approved' && (
              <button
                type="button"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                className="link-action"
              >
                {reopenMutation.isPending ? 'Reopening…' : 'Reopen to edit'}
              </button>
            )}
            {quotation.pending_clarity_count > 0 && (
              <button
                type="button"
                onClick={() => setOnlyUnclear((on) => !on)}
                aria-pressed={showUnclear}
                className="inline-flex min-h-control items-center gap-1 rounded-control px-2 font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {quotation.pending_clarity_count} item
                {quotation.pending_clarity_count > 1 ? 's' : ''} need clarity
                <span className="underline">
                  {showUnclear ? 'Show all' : 'Show only these'}
                </span>
              </button>
            )}
            <Link
              href={`/dashboard/clients/${id}/versions`}
              className="inline-flex min-h-11 items-center text-primary-700 hover:underline dark:text-primary-300"
            >
              {latestVersion
                ? `${versions.length} saved version${
                    versions.length === 1 ? '' : 's'
                  } · latest ${latestVersion.number}${
                    changedSinceSave ? ' · changed since' : ''
                  }`
                : 'Not saved as a version yet'}
            </Link>
            {latestShares.length > 0 && (
              <span className="text-dark-600 dark:text-dark-300">
                {views === 0
                  ? 'Customer has not opened it yet'
                  : `Customer opened it ${views}×${
                      lastViewed ? ` · last ${timeAgo(lastViewed)}` : ''
                    }`}
              </span>
            )}
            <span className="ml-auto text-xs text-dark-500 dark:text-dark-400">
              Edited {timeAgo(lastEdited(quotation) ?? quotation.created_at)}
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
            <div
              className={`${CARD_CLS} !border-primary-500 !p-3 text-center ring-1 ring-primary-500/40 sm:!p-4`}
            >
              <p className="field-label">Negotiated Offer</p>
              <p className="text-lg font-extrabold tabular-nums tracking-tight text-dark-900 dark:text-white sm:text-3xl">
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
              {discountPercent(quotation) && (
                <p className="text-xs font-medium text-green-700 dark:text-green-400">
                  {discountPercent(quotation)}% off
                </p>
              )}
            </div>
          </div>

          <QuotationAddPanel
            clientId={id}
            hasRows={quotation.rooms.length > 0}
            onAddByHand={() => {
              setAddToRoom(null);
              setShowAdd(true);
            }}
            onNotesSaved={openSavedNotes}
          />

          {visibleRooms.map((group) => (
            <RoomSection
              key={group.room}
              group={group}
              clientId={id}
              isCollapsed={!showUnclear && collapsedRooms.has(group.room)}
              cpNumbers={cpNumbers}
              showCol={showCol}
              colLabel={colLabel}
              customCols={customCols}
              deletePending={deleteItemMutation.isPending}
              onToggle={() => toggleRoom(group.room)}
              onAddRow={() => {
                setAddToRoom(group.room);
                setShowAdd(true);
              }}
              onEdit={setEditing}
              onDelete={(item) => deleteItemMutation.mutate(item)}
              quickUpdate={quickUpdate}
            />
          ))}
        </>
      )}

      {savingVersion && quotation && (
        <SaveVersionModal
          clientId={id}
          quotation={quotation}
          onClose={() => setSavingVersion(false)}
        />
      )}

      {showAdd && quotation && (
        <AddRowsSheet
          clientId={id}
          rooms={existingRooms}
          customCols={customCols}
          defaultRoom={addToRoom ?? undefined}
          onCreate={(payload) => createLineItem(quotation.id, payload)}
          onChanged={invalidate}
          onClose={() => setShowAdd(false)}
        />
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

'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { fmtRupees } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { checkIntake } from '@/lib/intake';
import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import {
  blankRow,
  isFilled,
  materialLabel,
  rowPayload,
  rowPrice,
  rowProblem,
  withDescription,
  type LineItemRow,
} from '@/lib/lineItemRows';
import { getMaterials, type Material } from '@/lib/quotation';
import type {
  LineItemCreate,
  QuotationLineItem,
} from '@/lib/schemas/quotation';
import { UNIT_OPTIONS } from '@/components/quotation/quotationStyles';

const START_ROWS = 3;
const GRID_CLS =
  'md:grid-cols-[minmax(0,1fr)_6.5rem_8rem_5rem_6.5rem_6.5rem_2.75rem]';
const LABEL_CLS = 'field-label md:sr-only';

/**
 * Adds many rows to one room in one go: a table in a large popup on desktop,
 * stacked cards on a full-screen sliding sheet on phones. Fully blank rows are
 * ignored. If a save fails partway, the unsaved rows stay here to retry.
 */
export function AddRowsSheet({
  clientId,
  rooms,
  customCols,
  defaultRoom,
  onCreate,
  onChanged,
  onClose,
}: {
  clientId: string;
  rooms: string[];
  customCols: LineItemColumnDef[];
  defaultRoom?: string;
  onCreate: (payload: LineItemCreate) => Promise<QuotationLineItem>;
  /** Called after any row is saved, so the quotation behind can refresh. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const nextId = useRef(START_ROWS);
  const [room, setRoom] = useState(defaultRoom ?? '');
  const [rows, setRows] = useState<LineItemRow[]>(() =>
    Array.from({ length: START_ROWS }, (_, id) => blankRow(id))
  );
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => getMaterials(),
  });

  const filled = rows.filter(isFilled);

  useEffect(() => {
    if (defaultRoom) setFocusRow(0);
    else roomRef.current?.focus();
  }, [defaultRoom]);

  useEffect(() => {
    if (focusRow === null) return;
    formRef.current
      ?.querySelector<HTMLInputElement>(`[data-row-start="${focusRow}"]`)
      ?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const requestClose = () => {
    if (saving) return;
    if (filled.length > 0 && !window.confirm('Discard the rows you typed?'))
      return;
    onClose();
  };

  const updateRow = (id: number, edit: (row: LineItemRow) => LineItemRow) => {
    setRows((prev) => prev.map((r) => (r.id === id ? edit(r) : r)));
    setDuplicates([]);
    setRowErrors(({ [id]: _cleared, ...rest }) => rest);
  };

  /** New rows keep the last row's unit: a room's items usually share one. */
  const addRow = () => {
    const id = nextId.current++;
    setRows((prev) => [...prev, blankRow(id, prev.at(-1)?.unit)]);
    setFocusRow(id);
  };

  const removeRow = (id: number) => {
    const next = rows.filter((r) => r.id !== id);
    if (next.length > 0) {
      setRows(next);
    } else {
      setRows([blankRow(nextId.current++)]);
    }
    setRowErrors(({ [id]: _cleared, ...rest }) => rest);
  };

  /** Enter moves down a row, adding one at the end, so typing never stops. */
  const onRowKeyDown = (e: KeyboardEvent, id: number) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const index = rows.findIndex((r) => r.id === id);
    const next = rows[index + 1];
    if (next) setFocusRow(next.id);
    else addRow();
  };

  /** Lines already in the quotation that a typed row looks like, named for the designer. */
  const findDuplicates = async (): Promise<string[]> => {
    try {
      const results = await checkIntake(
        clientId,
        filled.map((r) => ({ room: room.trim(), description: r.description }))
      );
      return results.flatMap((res, i) =>
        res.similar
          ? [`“${filled[i].description}” looks like ${res.similar.summary}`]
          : []
      );
    } catch {
      return [];
    }
  };

  const save = async (thenNextRoom: boolean, confirmed = false) => {
    if (!room.trim()) {
      setFormError('Choose a room first.');
      roomRef.current?.focus();
      return;
    }
    if (filled.length === 0) {
      setFormError('Fill in at least one row.');
      return;
    }
    const problems: Record<number, string> = {};
    for (const row of filled) {
      const problem = rowProblem(room, row, customCols);
      if (problem) problems[row.id] = problem;
    }
    setRowErrors(problems);
    const firstBad = filled.find((r) => problems[r.id]);
    if (firstBad) {
      setFormError(null);
      setFocusRow(firstBad.id);
      return;
    }

    setFormError(null);
    if (!confirmed) {
      setSaving(true);
      const found = await findDuplicates();
      setSaving(false);
      if (found.length > 0) {
        setDuplicates(found);
        return;
      }
    }
    setDuplicates([]);
    setSaving(true);
    const savedIds = new Set<number>();
    let flagged = 0;
    let failure: unknown = null;
    for (const row of filled) {
      try {
        const item = await onCreate({
          ...rowPayload(room, row, customCols),
          allow_duplicate: confirmed,
        });
        savedIds.add(row.id);
        if (item.status === 'pending_clarity') flagged += 1;
      } catch (err) {
        failure = err;
        break;
      }
    }
    setSaving(false);
    if (savedIds.size > 0) onChanged();

    if (failure) {
      setRows((prev) => prev.filter((r) => !savedIds.has(r.id)));
      if (failure instanceof ApiError && failure.status === 409) {
        // The server found a similar line the earlier check did not.
        setDuplicates([failure.message]);
        setFormError(
          savedIds.size > 0
            ? `${savedIds.size} of ${filled.length} saved.`
            : null
        );
        return;
      }
      setFormError(
        `${savedIds.size} of ${filled.length} saved. ${errorMessage(failure, "The rest couldn't be saved")}. Try again.`
      );
      return;
    }

    const count = savedIds.size;
    toast.success(
      `${count} row${count === 1 ? '' : 's'} added to ${room.trim()}`
    );
    if (flagged > 0) {
      toast.warning(`${flagged} flagged: dimension needs clarification`);
    }
    if (!thenNextRoom) {
      onClose();
      return;
    }
    setRoom('');
    setRows(
      Array.from({ length: START_ROWS }, () => blankRow(nextId.current++))
    );
    roomRef.current?.focus();
  };

  return (
    <Modal
      open
      onClose={requestClose}
      title="Add rows"
      description="Enter moves to the next row. Blank rows are ignored."
      maxWidth="6xl"
    >
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        className="-mb-6 flex flex-col gap-4 max-md:min-h-[calc(100dvh-7rem)] max-sm:-mb-4"
      >
        <label className="block md:max-w-sm">
          <span className="field-label">Room *</span>
          <input
            ref={roomRef}
            className={INPUT_CLS}
            list="add-rows-rooms"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setFormError(null);
              setDuplicates([]);
            }}
            placeholder="Living Room"
          />
          <datalist id="add-rows-rooms">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>

        <datalist id="add-rows-materials">
          {materials.map((m) => (
            <option key={m.id} value={materialLabel(m)} />
          ))}
        </datalist>

        <div className="flex-1 space-y-3 md:space-y-2">
          <div
            aria-hidden
            className={`hidden gap-2 md:grid ${GRID_CLS} field-label`}
          >
            <span>Description *</span>
            <span>Unit</span>
            <span>Dimension</span>
            <span>Qty</span>
            <span>Rate (₹)</span>
            <span className="text-right">Price</span>
            <span />
          </div>

          {rows.map((row, index) => {
            const price = rowPrice(row);
            const error = rowErrors[row.id];
            const n = index + 1;
            return (
              <div
                key={row.id}
                onKeyDown={(e) => onRowKeyDown(e, row.id)}
                className="rounded-2xl border border-line p-3 md:rounded-none md:border-0 md:p-0"
              >
                <div className={`grid grid-cols-2 gap-2 ${GRID_CLS}`}>
                  <label className="col-span-2 md:col-span-1">
                    <span className={LABEL_CLS}>Row {n} description *</span>
                    <input
                      data-row-start={row.id}
                      className={INPUT_CLS}
                      list="add-rows-materials"
                      value={row.description}
                      aria-invalid={!!error}
                      placeholder="Type an item or pick from your library"
                      onChange={(e) =>
                        updateRow(row.id, (r) =>
                          withDescription(r, e.target.value, materials)
                        )
                      }
                    />
                  </label>
                  <label>
                    <span className={LABEL_CLS}>Row {n} unit</span>
                    <select
                      className={INPUT_CLS}
                      value={row.unit}
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({
                          ...r,
                          unit: e.target.value,
                        }))
                      }
                    >
                      {(UNIT_OPTIONS.includes(row.unit)
                        ? UNIT_OPTIONS
                        : [...UNIT_OPTIONS, row.unit]
                      ).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={LABEL_CLS}>Row {n} dimension</span>
                    <input
                      className={INPUT_CLS}
                      value={row.raw_dimension}
                      placeholder={"5'x3'"}
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({
                          ...r,
                          raw_dimension: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={LABEL_CLS}>Row {n} qty</span>
                    <input
                      className={INPUT_CLS}
                      inputMode="decimal"
                      value={row.qty}
                      placeholder="4"
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({
                          ...r,
                          qty: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={LABEL_CLS}>Row {n} rate (₹)</span>
                    <input
                      className={INPUT_CLS}
                      inputMode="decimal"
                      value={row.rate}
                      placeholder="450"
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({
                          ...r,
                          rate: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <p className="flex min-h-control items-center text-sm font-medium tabular-nums text-dark-900 dark:text-white md:justify-end">
                    {price !== null ? (
                      fmtRupees(price)
                    ) : (
                      <span className="text-xs font-normal text-dark-500 dark:text-dark-400">
                        {row.raw_dimension.trim() ? 'On save' : '—'}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove row ${n}`}
                    title={`Remove row ${n}`}
                    className="flex min-h-control items-center justify-center justify-self-end rounded-lg px-3 text-dark-500 hover:bg-red-50 hover:text-red-600 dark:text-dark-400 dark:hover:bg-red-500/10 dark:hover:text-red-400 md:px-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {customCols.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {customCols.map((c) => (
                      <label key={c.key}>
                        <span className="field-label">
                          {c.required ? `${c.label} *` : c.label}
                        </span>
                        <input
                          className={INPUT_CLS}
                          inputMode={
                            c.type === 'number' ? 'decimal' : undefined
                          }
                          value={row.extra[c.key] ?? ''}
                          onChange={(e) =>
                            updateRow(row.id, (r) => ({
                              ...r,
                              extra: { ...r.extra, [c.key]: e.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}

                {error && (
                  <p
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-400"
                  >
                    Row {n}: {error}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="inline-flex min-h-control items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary-600 hover:bg-primary-50/70 dark:text-primary-400 dark:hover:bg-white/[0.06]"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add row
          </button>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 border-t border-line bg-white px-6 py-4 dark:bg-dark-800 max-sm:-mx-4 max-sm:px-4">
          {duplicates.length > 0 && (
            <div
              role="alert"
              className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
            >
              <p className="font-medium">Already in this quotation?</p>
              <ul className="list-disc pl-5">
                {duplicates.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">
                Edit the existing line instead, change the rows, or add anyway.
              </p>
            </div>
          )}
          {formError && (
            <p
              role="alert"
              className="mb-2 text-sm text-red-600 dark:text-red-400"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:[&>button]:flex-1">
            <p
              aria-live="polite"
              className="mr-auto text-sm text-dark-600 dark:text-dark-300 max-sm:w-full"
            >
              {filled.length} row{filled.length === 1 ? '' : 's'} to add
            </p>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="btn-secondary max-sm:hidden"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => save(true, duplicates.length > 0)}
              disabled={saving}
              className="btn-secondary"
            >
              Save &amp; next room
            </button>
            <button
              type="button"
              onClick={() => save(false, duplicates.length > 0)}
              disabled={saving}
              className="btn-primary"
            >
              {saving
                ? 'Saving…'
                : duplicates.length > 0
                  ? 'Add anyway'
                  : 'Save rows'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

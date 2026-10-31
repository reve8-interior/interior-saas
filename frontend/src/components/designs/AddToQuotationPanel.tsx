'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { INPUT_CLS } from '@/lib/constants';
import { addHotspotToQuotation } from '@/lib/designs';
import { getQuotation } from '@/lib/quotation';
import type { Hotspot } from '@/lib/schemas/design';
import type { Quotation } from '@/lib/schemas/quotation';
import { fmtRate } from '@/lib/format';
import { rateDrift } from '@/lib/designStatus';
import { errorMessage } from '@/lib/errors';

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'dimension', 'lumpsum'];

interface AddToQuotationPanelProps {
  clientId: string;
  designId: string;
  /** The saved hotspot; its label, material and notes seed the form. */
  hotspot: Hotspot;
  /** Room to pre-fill, usually the design's first room tag. */
  defaultRoom?: string;
}

interface FormState {
  room: string;
  description: string;
  unit: string;
  raw_dimension: string;
  qty: string;
  rate: string;
  remarks: string;
}

const seed = (hotspot: Hotspot, room = ''): FormState => {
  const unit = hotspot.material?.unit ?? 'sqft';
  return {
    room,
    description: hotspot.label,
    unit,
    raw_dimension: '',
    // A counted item is almost always one piece.
    qty: unit === 'nos' ? '1' : '',
    rate: hotspot.material ? String(Number(hotspot.material.unit_cost)) : '',
    remarks: hotspot.notes ?? '',
  };
};

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Turns the selected hotspot into a line on the client's quotation. */
export function AddToQuotationPanel({
  clientId,
  designId,
  hotspot,
  defaultRoom,
}: AddToQuotationPanelProps) {
  const qc = useQueryClient();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => seed(hotspot, defaultRoom));
  const [error, setError] = useState<string | null>(null);

  // Existing quotation, for room suggestions and the linked line; a client may have none yet.
  const { data: quotation = null } = useQuery<Quotation | null>({
    queryKey: ['quotation-panel', clientId],
    queryFn: async () => {
      try {
        return await getQuotation(clientId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const rooms = quotation?.rooms.map((r) => r.room) ?? [];
  const linked = quotation?.rooms
    .flatMap((r) => r.items)
    .find((i) => i.id === hotspot.quotation_line_item_id);

  const add = useMutation({
    mutationFn: () =>
      addHotspotToQuotation(clientId, designId, hotspot.id, {
        room: form.room.trim(),
        description: form.description.trim() || null,
        unit: form.unit,
        raw_dimension: form.raw_dimension.trim() || null,
        qty: numOrNull(form.qty),
        rate: numOrNull(form.rate),
        remarks: form.remarks.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designs', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-panel', clientId] });
      toast.success('Added to quotation');
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add to quotation')),
  });

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const submit = () => {
    if (!form.room.trim()) return setError('Room is required');
    for (const [label, v] of [
      ['Qty', form.qty],
      ['Rate', form.rate],
    ] as const) {
      if (v.trim() !== '' && (isNaN(Number(v)) || Number(v) < 0)) {
        return setError(`${label} must be a non-negative number`);
      }
    }
    setError(null);
    add.mutate();
  };

  if (hotspot.quotation_line_item_id) {
    const drift = rateDrift(hotspot.material?.unit_cost, linked?.rate);
    return (
      <div className="surface space-y-2 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-green-700 dark:text-green-400">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
              In quotation
              {linked &&
                ` · ${linked.room}${
                  (linked.negotiated_price ?? linked.initial_price) != null
                    ? ` · ${fmtRate(Number(linked.negotiated_price ?? linked.initial_price))}`
                    : ''
                }`}
            </span>
          </span>
          <Link
            href={`/dashboard/clients/${clientId}/quotation?item=${hotspot.quotation_line_item_id}`}
            className="shrink-0 text-primary-600 hover:underline dark:text-primary-400"
          >
            View line →
          </Link>
        </div>
        {drift !== null && (
          <p
            role="status"
            className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
          >
            The material&apos;s rate is now {fmtRate(drift)}, but this line
            still uses {fmtRate(linked?.rate ?? 0)}. Update the line in the
            quotation if the new rate should apply.
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setForm(seed(hotspot, defaultRoom));
          setError(null);
          setOpen(true);
        }}
        className="btn-secondary w-full"
      >
        <ClipboardList className="h-4 w-4" />
        Add to quotation
      </button>
    );
  }

  return (
    <div className="surface space-y-3 p-4">
      <h4 className="text-sm font-medium text-dark-900 dark:text-white">
        Add to quotation
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${uid}-room`}
            className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
          >
            Room *
          </label>
          <input
            id={`${uid}-room`}
            className={INPUT_CLS}
            list="design-quotation-rooms"
            value={form.room}
            maxLength={100}
            onChange={(e) => set('room')(e.target.value)}
            placeholder="Living Room"
          />
          <datalist id="design-quotation-rooms">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {rooms.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set('room')(r)}
                  aria-pressed={form.room === r}
                  className="filter-chip"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label
            htmlFor={`${uid}-unit`}
            className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
          >
            Unit *
          </label>
          <select
            id={`${uid}-unit`}
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
        </div>
      </div>

      <div>
        <label
          htmlFor={`${uid}-description`}
          className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
        >
          Description
        </label>
        <input
          id={`${uid}-description`}
          className={INPUT_CLS}
          value={form.description}
          maxLength={500}
          onChange={(e) => set('description')(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            htmlFor={`${uid}-dimension`}
            className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
          >
            Dimension
          </label>
          <input
            id={`${uid}-dimension`}
            className={INPUT_CLS}
            value={form.raw_dimension}
            maxLength={50}
            onChange={(e) => set('raw_dimension')(e.target.value)}
            placeholder={"5'x3'"}
          />
        </div>
        <div>
          <label
            htmlFor={`${uid}-qty`}
            className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
          >
            Qty
          </label>
          <input
            id={`${uid}-qty`}
            className={INPUT_CLS}
            inputMode="decimal"
            value={form.qty}
            onChange={(e) => set('qty')(e.target.value)}
            placeholder="4"
          />
        </div>
        <div>
          <label
            htmlFor={`${uid}-rate`}
            className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
          >
            Rate (₹)
          </label>
          <input
            id={`${uid}-rate`}
            className={INPUT_CLS}
            inputMode="decimal"
            value={form.rate}
            onChange={(e) => set('rate')(e.target.value)}
            placeholder="450"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${uid}-remarks`}
          className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
        >
          Remarks
        </label>
        <textarea
          id={`${uid}-remarks`}
          className={INPUT_CLS}
          rows={2}
          value={form.remarks}
          maxLength={2000}
          onChange={(e) => set('remarks')(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={add.isPending}
          className="btn-primary"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

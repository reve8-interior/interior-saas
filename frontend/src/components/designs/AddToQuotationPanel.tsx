'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { INPUT_CLS } from '@/lib/constants';
import { addHotspotToQuotation } from '@/lib/designs';
import { getQuotation } from '@/lib/quotation';
import type { Hotspot } from '@/lib/schemas/design';
import { errorMessage } from '@/lib/errors';

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'dimension', 'lumpsum'];

interface AddToQuotationPanelProps {
  clientId: string;
  designId: string;
  /** The saved hotspot; its label, material and notes seed the form. */
  hotspot: Hotspot;
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

const seed = (hotspot: Hotspot): FormState => ({
  room: '',
  description: hotspot.label,
  unit: hotspot.material?.unit ?? 'sqft',
  raw_dimension: '',
  qty: '',
  rate: hotspot.material ? String(Number(hotspot.material.unit_cost)) : '',
  remarks: hotspot.notes ?? '',
});

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Turns the selected hotspot into a line on the client's quotation. */
export function AddToQuotationPanel({
  clientId,
  designId,
  hotspot,
}: AddToQuotationPanelProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => seed(hotspot));
  const [error, setError] = useState<string | null>(null);

  // Existing rooms, for the room suggestions; a client may have no quotation yet.
  const { data: rooms = [] } = useQuery<string[]>({
    queryKey: ['quotation-rooms', clientId],
    queryFn: async () => {
      try {
        return (await getQuotation(clientId)).rooms.map((r) => r.room);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return [];
        throw e;
      }
    },
    enabled: open,
  });

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
      qc.invalidateQueries({ queryKey: ['quotation-rooms', clientId] });
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
    return (
      <div className="surface flex items-center justify-between gap-3 p-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <Check className="h-4 w-4" />
          In quotation
        </span>
        <Link
          href={`/dashboard/clients/${clientId}/quotation`}
          className="text-primary-600 hover:underline dark:text-primary-400"
        >
          View quotation
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setForm(seed(hotspot));
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
          <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
            Room *
          </label>
          <input
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
        </div>
        <div>
          <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
            Unit *
          </label>
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
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
          Description
        </label>
        <input
          className={INPUT_CLS}
          value={form.description}
          maxLength={500}
          onChange={(e) => set('description')(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
            Dimension
          </label>
          <input
            className={INPUT_CLS}
            value={form.raw_dimension}
            maxLength={50}
            onChange={(e) => set('raw_dimension')(e.target.value)}
            placeholder={"5'x3'"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
            Qty
          </label>
          <input
            className={INPUT_CLS}
            inputMode="decimal"
            value={form.qty}
            onChange={(e) => set('qty')(e.target.value)}
            placeholder="4"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
            Rate (₹)
          </label>
          <input
            className={INPUT_CLS}
            inputMode="decimal"
            value={form.rate}
            onChange={(e) => set('rate')(e.target.value)}
            placeholder="450"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
          Remarks
        </label>
        <textarea
          className={INPUT_CLS}
          rows={2}
          value={form.remarks}
          maxLength={2000}
          onChange={(e) => set('remarks')(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
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

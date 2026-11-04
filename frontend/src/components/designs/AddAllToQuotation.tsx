'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { INPUT_CLS } from '@/lib/constants';
import { addHotspotToQuotation } from '@/lib/designs';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Design } from '@/lib/schemas/design';

interface AddAllToQuotationProps {
  clientId: string;
  design: Design;
  /** Room pre-filled from the design's first room tag. */
  defaultRoom?: string;
}

/** Adds every hotspot not yet in the quotation as a line, in one step. */
export function AddAllToQuotation({
  clientId,
  design,
  defaultRoom = '',
}: AddAllToQuotationProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(defaultRoom);
  const pending = design.hotspots.filter((h) => !h.quotation_line_item_id);

  const addAll = useMutation({
    mutationFn: async () => {
      let added = 0;
      let skipped = 0;
      // Sequential: the first call may create the quotation itself.
      for (const h of pending) {
        const unit = h.material?.unit ?? 'sqft';
        try {
          await addHotspotToQuotation(clientId, design.id, h.id, {
            room: room.trim(),
            description: h.label,
            unit,
            raw_dimension: null,
            qty: unit === 'nos' ? 1 : null,
            rate: h.material ? Number(h.material.unit_cost) : null,
            remarks: h.notes ?? null,
          });
          added += 1;
        } catch (e) {
          // A similar line is already in the room: leave it for the
          // designer to add one by one rather than create a duplicate.
          if (e instanceof ApiError && e.status === 409) skipped += 1;
          else throw e;
        }
      }
      return { added, skipped };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['designs', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-panel', clientId] });
    },
    onSuccess: ({ added, skipped }) => {
      toast.success(
        `${added} hotspot${added === 1 ? '' : 's'} added to quotation` +
          (skipped > 0
            ? `; ${skipped} skipped because a similar line is already there`
            : '')
      );
      setOpen(false);
    },
    onError: (e) =>
      toast.error(errorMessage(e, 'Some hotspots could not be added')),
  });

  if (pending.length < 2) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary w-full"
      >
        <ClipboardList className="h-4 w-4" aria-hidden />
        Add all {pending.length} hotspots to quotation
      </button>
    );
  }

  return (
    <div className="surface space-y-3 p-4">
      <h4 className="text-sm font-medium text-dark-900 dark:text-white">
        Add {pending.length} hotspots to quotation
      </h4>
      <label className="block">
        <span className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
          Room *
        </span>
        <input
          className={INPUT_CLS}
          value={room}
          maxLength={100}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Living Room"
        />
      </label>
      <p className="text-xs text-dark-500 dark:text-dark-400">
        Unit and rate come from each hotspot&apos;s material. Set quantities and
        dimensions in the quotation afterwards.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={addAll.isPending}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => addAll.mutate()}
          disabled={addAll.isPending || !room.trim()}
          className="btn-primary"
        >
          {addAll.isPending ? 'Adding…' : `Add ${pending.length}`}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import { setDesignRooms } from '@/lib/designs';
import { getQuotation } from '@/lib/quotation';
import type { Design } from '@/lib/schemas/design';
import type { Quotation } from '@/lib/schemas/quotation';
import { errorMessage } from '@/lib/errors';

interface RoomTagsModalProps {
  clientId: string;
  design: Design;
  onClose: () => void;
}

/** Say which rooms of the quotation this image belongs to. */
export function RoomTagsModal({
  clientId,
  design,
  onClose,
}: RoomTagsModalProps) {
  const qc = useQueryClient();
  const [rooms, setRooms] = useState<string[]>(design.rooms);
  const [custom, setCustom] = useState('');

  const { data: quotation } = useQuery<Quotation>({
    queryKey: ['quotation', clientId],
    queryFn: () => getQuotation(clientId),
    retry: false,
  });

  // Rooms from the quotation, plus any tagged earlier that no longer exist.
  const options = [
    ...new Set([...(quotation?.rooms.map((r) => r.room) ?? []), ...rooms]),
  ];

  const toggle = (room: string) =>
    setRooms((cur) =>
      cur.includes(room) ? cur.filter((r) => r !== room) : [...cur, room]
    );

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const name = custom.trim();
    if (name && !rooms.some((r) => r.toLowerCase() === name.toLowerCase())) {
      setRooms((cur) => [...cur, name]);
    }
    setCustom('');
  };

  const save = useMutation({
    mutationFn: () => setDesignRooms(clientId, design.id, rooms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designs', clientId] });
      toast.success('Rooms saved');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save rooms')),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Which rooms is this image for?"
      description="When you save a quotation version, this image will be attached to these rooms automatically."
      maxWidth="lg"
    >
      <div className="space-y-5">
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {options.map((room) => {
              const on = rooms.includes(room);
              return (
                <button
                  key={room}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(room)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                    on
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-600/20 dark:text-primary-300'
                      : 'border-line text-dark-700 hover:bg-dark-100 dark:border-primary-300/15 dark:text-dark-300 dark:hover:bg-dark-800'
                  }`}
                >
                  {room}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-dark-500 dark:text-dark-400">
            The quotation has no rooms yet. Type a room name below.
          </p>
        )}

        <form onSubmit={addCustom} className="flex gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="room-tag-custom">
              Add another room
            </label>
            <input
              id="room-tag-custom"
              value={custom}
              maxLength={100}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Master Bedroom"
              className={INPUT_CLS}
            />
          </div>
          <button type="submit" className="btn-secondary mt-6 self-start">
            Add
          </button>
        </form>

        <ModalFooter
          onCancel={onClose}
          onConfirm={() => save.mutate()}
          loading={save.isPending}
          confirmLabel="Save rooms"
        />
      </div>
    </Modal>
  );
}

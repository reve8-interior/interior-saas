'use client';

import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Design } from '@/lib/schemas/design';

interface RoomImagePickerProps {
  rooms: string[];
  designs: Design[];
  /** Room name -> ids of the designs shown with that room. */
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}

/** Pre-select designs for each room from the rooms they are tagged with. */
export function designsByRoomTag(
  rooms: string[],
  designs: Design[]
): Record<string, string[]> {
  const byKey = new Map(rooms.map((r) => [r.toLowerCase(), r]));
  const result: Record<string, string[]> = {};
  for (const design of designs) {
    for (const tag of design.rooms) {
      const room = byKey.get(tag.toLowerCase());
      if (room) result[room] = [...(result[room] ?? []), design.id];
    }
  }
  return result;
}

/**
 * For every room: the images attached to it (each with a remove button) and an
 * "Add image" popup: pick one or more of the images not attached yet, then confirm.
 */
export function RoomImagePicker({
  rooms,
  designs,
  value,
  onChange,
}: RoomImagePickerProps) {
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const withImage = designs.filter((d) => d.image_url);

  if (withImage.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-sm text-dark-500 dark:border-line dark:text-dark-400">
        No design images yet. Upload images in the Designs tab, then come back
        here to attach them to rooms.
      </p>
    );
  }

  const byId = new Map(withImage.map((d) => [d.id, d]));
  const setRoom = (room: string, ids: string[]) =>
    onChange({ ...value, [room]: ids });
  const attachedTo = (room: string) =>
    (value[room] ?? []).filter((id) => byId.has(id));
  const closePicker = () => {
    setOpenRoom(null);
    setSelected([]);
  };
  const toggleSelected = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const pickerAvailable = openRoom
    ? withImage.filter((d) => !attachedTo(openRoom).includes(d.id))
    : [];

  return (
    <>
      <ul className="divide-y divide-line rounded-xl bg-surface-2 dark:divide-line dark:border-line">
        {rooms.map((room) => {
          const attached = attachedTo(room);
          const available = withImage.filter((d) => !attached.includes(d.id));
          return (
            <li key={room} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-dark-900 dark:text-white">
                  {room}
                  <span className="ml-2 text-xs font-normal text-dark-500 dark:text-dark-400">
                    {attached.length === 0
                      ? 'No image'
                      : `${attached.length} image${attached.length === 1 ? '' : 's'}`}
                  </span>
                </p>
                {available.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenRoom(room)}
                    className="btn-secondary btn-sm"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add image
                  </button>
                )}
              </div>

              {attached.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {attached.map((id) => {
                    const design = byId.get(id);
                    if (!design) return null;
                    return (
                      <li
                        key={id}
                        className="relative w-28 overflow-hidden rounded-xl bg-surface-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          loading="lazy"
                          decoding="async"
                          src={design.thumb_url ?? design.image_url ?? ''}
                          alt=""
                          className="h-20 w-full object-cover"
                        />
                        <span className="block truncate px-2 py-1 text-xs text-dark-700 dark:text-dark-300">
                          {design.title || 'Untitled'}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${design.title || 'image'} from ${room}`}
                          onClick={() =>
                            setRoom(
                              room,
                              attached.filter((d) => d !== id)
                            )
                          }
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <Modal
        open={openRoom !== null}
        onClose={closePicker}
        title={`Add images to ${openRoom ?? ''}`}
        description="Select the images your customer should see for this room."
        maxWidth="xl"
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pickerAvailable.map((design) => {
            const on = selected.includes(design.id);
            return (
              <li key={design.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSelected(design.id)}
                  className={`relative block w-full overflow-hidden rounded-xl border-2 bg-surface text-left transition-colors ${
                    on ? 'border-brand' : 'border-line hover:border-brand/50'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    decoding="async"
                    src={design.thumb_url ?? design.image_url ?? ''}
                    alt=""
                    className="h-28 w-full object-cover"
                  />
                  <span className="block truncate px-2 py-1.5 text-xs text-dark-700 dark:text-dark-300">
                    {design.title || 'Untitled'}
                  </span>
                  {on && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={closePicker}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={selected.length === 0}
            onClick={() => {
              if (openRoom)
                setRoom(openRoom, [...attachedTo(openRoom), ...selected]);
              closePicker();
            }}
          >
            {selected.length === 0
              ? 'Add'
              : `Add ${selected.length} image${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </Modal>
    </>
  );
}

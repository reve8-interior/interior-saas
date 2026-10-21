'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
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
 * "Add image" tray that lists only the images not attached yet.
 */
export function RoomImagePicker({
  rooms,
  designs,
  value,
  onChange,
}: RoomImagePickerProps) {
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const withImage = designs.filter((d) => d.image_url);

  if (withImage.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-sm text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
        No design images yet. Upload images in the Designs tab, then come back
        here to attach them to rooms.
      </p>
    );
  }

  const byId = new Map(withImage.map((d) => [d.id, d]));
  const setRoom = (room: string, ids: string[]) =>
    onChange({ ...value, [room]: ids });

  return (
    <ul className="divide-y divide-line rounded-xl border border-line dark:divide-primary-300/10 dark:border-primary-300/15">
      {rooms.map((room) => {
        const attached = (value[room] ?? []).filter((id) => byId.has(id));
        const available = withImage.filter((d) => !attached.includes(d.id));
        const open = openRoom === room;
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
                  aria-expanded={open}
                  onClick={() => setOpenRoom(open ? null : room)}
                  className="btn-secondary min-h-11"
                >
                  {open ? (
                    'Done'
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add image
                    </>
                  )}
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
                      className="relative w-28 overflow-hidden rounded-xl border border-line dark:border-primary-300/15"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={design.image_url ?? ''}
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

            {open && (
              <div className="rounded-xl bg-dark-50 p-3 dark:bg-dark-900">
                <p className="mb-2 text-xs text-dark-600 dark:text-dark-300">
                  Tap an image to add it to {room}.
                </p>
                <ul className="flex flex-wrap gap-3">
                  {available.map((design) => (
                    <li key={design.id}>
                      <button
                        type="button"
                        onClick={() => setRoom(room, [...attached, design.id])}
                        className="w-28 overflow-hidden rounded-xl border-2 border-line bg-white text-left transition-colors hover:border-primary-400 dark:border-primary-300/15 dark:bg-dark-800"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={design.image_url ?? ''}
                          alt=""
                          className="h-20 w-full object-cover"
                        />
                        <span className="block truncate px-2 py-1 text-xs text-dark-700 dark:text-dark-300">
                          {design.title || 'Untitled'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

'use client';

import { errorMessage } from '@/lib/errors';
import type { DesignLibraryItem } from '@/lib/schemas/site';
import { attachDesigns, uploadProjectImage } from '@/lib/site';
import { ChangeEvent, useState } from 'react';
import { toast } from 'sonner';

interface ProjectDesignPickerProps {
  projectId: string;
  library: DesignLibraryItem[];
  /** Called after designs were attached or uploaded, so the parent refreshes. */
  onDone: () => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

function titleFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').slice(0, 255);
}

/** Pick existing designs for a project, or upload new images straight in. */
export function ProjectDesignPicker({
  projectId,
  library,
  onDone,
}: ProjectDesignPickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

  async function confirm() {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await attachDesigns(projectId, selected);
      setSelected([]);
      toast.success('Designs added');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add designs'));
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        await uploadProjectImage(projectId, file, titleFromFile(file));
        uploaded += 1;
      }
      toast.success(uploaded === 1 ? 'Image uploaded' : 'Images uploaded');
    } catch (err) {
      // Includes the plan's image-limit message from the server.
      toast.error(errorMessage(err, 'Upload failed'));
    } finally {
      setBusy(false);
      if (uploaded > 0) onDone();
    }
  }

  const movingCount = library.filter(
    (d) => d.project_id !== null && selected.includes(d.id)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="project-upload"
          className={`btn-secondary inline-flex ${busy ? 'opacity-50' : ''}`}
        >
          {busy ? 'Working…' : 'Upload new'}
        </label>
        <input
          id="project-upload"
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={onFiles}
        />
        <span className="text-xs text-dark-500">JPG, PNG or WebP</span>
      </div>

      {library.length === 0 ? (
        <p className="text-sm text-dark-500">No designs with images yet.</p>
      ) : (
        <ul className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {library.map((d) => {
            const here = d.project_id === projectId;
            const elsewhere = d.project_id !== null && !here;
            const checked = selected.includes(d.id);
            return (
              <li key={d.id}>
                <label
                  className={`block cursor-pointer overflow-hidden rounded-xl border ${
                    checked
                      ? 'border-brand-500 ring-brand-500 ring-2'
                      : 'border-dark-200 dark:border-white/10'
                  } ${here ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label={d.title || 'Untitled design'}
                    checked={checked}
                    disabled={here || busy}
                    onChange={() => toggle(d.id)}
                  />
                  <div className="aspect-[4/3] bg-dark-100 dark:bg-white/5">
                    {d.thumb_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.thumb_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="space-y-0.5 p-2 text-xs">
                    <p className="truncate font-semibold">
                      {d.title || 'Untitled'}
                    </p>
                    {d.client_name && (
                      <p className="truncate text-dark-500">{d.client_name}</p>
                    )}
                    {here && <p className="text-dark-500">Already here</p>}
                    {elsewhere && (
                      <p className="text-amber-600">In another project</p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {movingCount > 0 && (
        <p className="text-xs text-dark-500">
          Designs already in another project will move here.
        </p>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || selected.length === 0}
        onClick={confirm}
      >
        Add {selected.length > 0 ? `${selected.length} ` : ''}selected
      </button>
    </div>
  );
}

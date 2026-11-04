'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

interface FilePreviewListProps {
  files: File[];
  onRemove: (file: File) => void;
}

/** Thumbnails of the images chosen for upload, so they can be checked before sending. */
export function FilePreviewList({ files, onRemove }: FilePreviewListProps) {
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews]
  );

  const single = previews.length === 1;
  return (
    <ul
      className={`mt-2 grid gap-2 ${single ? '' : 'grid-cols-2 sm:grid-cols-3'}`}
    >
      {previews.map(({ file, url }) => (
        <li
          key={file.name + file.size}
          className="relative overflow-hidden rounded-lg border border-line"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */}
          <img
            src={url}
            alt={file.name}
            className={
              single
                ? 'max-h-[40vh] w-full bg-dark-100 object-contain dark:bg-dark-700'
                : 'aspect-[4/3] w-full bg-dark-100 object-cover dark:bg-dark-700'
            }
          />
          <p className="truncate px-2 py-1 text-xs text-dark-600 dark:text-dark-300">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <button
            type="button"
            onClick={() => onRemove(file)}
            aria-label={`Remove ${file.name}`}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

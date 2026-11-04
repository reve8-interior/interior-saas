'use client';

import { useState } from 'react';
import { SkeletonImage } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { MARKETING_URL } from '@/lib/constants';
import type { GalleryView } from '@/lib/schemas/site';

/** Public image grid for businesses on the gallery plan (no hotspots). */
export function SiteGallery({ view }: { view: GalleryView }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = view.designs.find((d) => d.id === openId) ?? null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="font-heading text-2xl font-bold text-dark-900 dark:text-white">
          {view.business_name}
        </h1>
      </header>

      {view.designs.length === 0 ? (
        <p className="text-sm text-dark-500 dark:text-dark-400">
          No designs have been added yet.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {view.designs.map((d) => {
            const src = d.thumb_url ?? d.image_url;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(d.id)}
                  aria-label={`Open ${d.title || 'design'}`}
                  className="group block w-full overflow-hidden rounded-lg border border-dark-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800"
                >
                  {src && (
                    <SkeletonImage
                      loading="lazy"
                      src={src}
                      alt={d.title || 'Design'}
                      className="h-56 w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          title={open.title || 'Design'}
          description={open.description ?? undefined}
          maxWidth="6xl"
        >
          {open.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={open.image_url}
              alt={open.title || 'Design'}
              className="mx-auto max-h-[75dvh] w-auto max-w-full object-contain"
            />
          )}
        </Modal>
      )}

      <footer className="border-t border-line pt-4 text-center text-xs text-faint">
        <a
          href={MARKETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Powered by Reve8
        </a>
      </footer>
    </main>
  );
}

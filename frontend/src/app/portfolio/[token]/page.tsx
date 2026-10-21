'use client';

import { MapPin } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { Modal } from '@/components/ui/Modal';
import { getPortfolioView } from '@/lib/designs';
import type { PortfolioView } from '@/lib/schemas/design';

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; view: PortfolioView };

/** Public showcase of a business's portfolio designs and their hotspots. */
export default function PortfolioPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [designId, setDesignId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refetched = useRef(false);

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', view: await getPortfolioView(token) });
    } catch {
      setState({ status: 'unavailable' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Signed image URLs expire; fetch fresh ones once if an image fails.
  const onImageError = () => {
    if (refetched.current) return;
    refetched.current = true;
    load();
  };

  if (state.status === 'loading') {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-lg bg-gray-200 dark:bg-dark-800"
            />
          ))}
        </div>
      </main>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="font-heading text-xl font-semibold text-dark-900 dark:text-white">
          This portfolio is not available
        </h1>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          The link may have been turned off. Please ask the designer for a new
          one.
        </p>
      </main>
    );
  }

  const { view } = state;
  const design = view.designs.find((d) => d.id === designId) ?? null;
  const selected = design?.hotspots.find((h) => h.id === selectedId) ?? null;

  const close = () => {
    setDesignId(null);
    setSelectedId(null);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="font-heading text-2xl font-bold text-dark-900 dark:text-white">
          {view.business_name ?? 'Portfolio'}
        </h1>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Selected work. Open a design and tap the marked areas to see what went
          into it.
        </p>
      </header>

      {view.designs.length === 0 ? (
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Nothing has been added to this portfolio yet.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {view.designs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setDesignId(d.id)}
                className="group block w-full overflow-hidden rounded-lg border border-dark-200 bg-white text-left shadow-sm dark:border-dark-700 dark:bg-dark-800"
              >
                {d.image_url && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.image_url}
                      alt={d.title || 'Design'}
                      onError={onImageError}
                      className="h-56 w-full object-cover transition group-hover:scale-[1.02]"
                    />
                    {d.hotspots.length > 0 && (
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        <MapPin className="h-3 w-3" />
                        {d.hotspots.length}
                      </span>
                    )}
                  </div>
                )}
                <p className="p-3 text-sm font-medium text-dark-900 dark:text-white">
                  {d.title || 'Untitled'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {design && (
        <Modal
          open
          onClose={close}
          title={design.title || 'Design'}
          description={design.description ?? undefined}
          maxWidth="4xl"
        >
          <div className="space-y-3">
            {design.image_url && (
              <HotspotImage
                src={design.image_url}
                alt={design.title || 'Design'}
                hotspots={design.hotspots}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onImageError={onImageError}
              />
            )}
            {selected && (
              <HotspotDetail
                label={selected.label}
                notes={selected.notes}
                item={selected.item}
                dimensions={selected.dimensions}
                onClose={() => setSelectedId(null)}
              />
            )}
            {design.hotspots.length > 0 && !selected && (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                Tap a marked area to see its details.
              </p>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}

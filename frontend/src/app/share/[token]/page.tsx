'use client';

import { LoadingRegion, PageHeaderSkeleton, Skeleton } from '@/components/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { getSharedView } from '@/lib/designs';
import type { SharedView } from '@/lib/schemas/design';

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; view: SharedView };

/** Public, view-only gallery reached from a designer's share link. */
export default function SharedDesignPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [designId, setDesignId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refetched = useRef(false);

  const load = useCallback(async () => {
    try {
      const view = await getSharedView(token);
      setState({ status: 'ready', view });
      setDesignId((current) => current ?? view.designs[0]?.id ?? null);
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
      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <LoadingRegion label="Loading designs" className="space-y-6">
          <PageHeaderSkeleton />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </LoadingRegion>
      </main>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="font-heading text-xl font-semibold text-dark-900 dark:text-white">
          This link is no longer available
        </h1>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          It may have expired or been withdrawn. Please ask your designer for a
          new link.
        </p>
      </main>
    );
  }

  const { view } = state;
  const design = view.designs.find((d) => d.id === designId) ?? null;
  const selected = design?.hotspots.find((h) => h.id === selectedId) ?? null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        {view.business_name && (
          <p className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
            {view.business_name}
          </p>
        )}
        <h1 className="font-heading text-2xl font-bold text-dark-900 dark:text-white">
          {view.project_name}
        </h1>
      </header>

      {!design ? (
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Nothing has been shared yet.
        </p>
      ) : (
        <>
          {view.designs.length > 1 && (
            <nav
              className="flex gap-2 overflow-x-auto pb-1"
              aria-label="Images"
            >
              {view.designs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDesignId(d.id);
                    setSelectedId(null);
                  }}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${
                    d.id === design.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-600/20 dark:text-primary-300'
                      : 'border-dark-200 text-dark-700 hover:bg-dark-100 dark:border-dark-700 dark:text-dark-300 dark:hover:bg-dark-800'
                  }`}
                >
                  {d.title || 'Untitled'}
                </button>
              ))}
            </nav>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
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
              {design.description && (
                <p className="text-sm text-dark-600 dark:text-dark-300">
                  {design.description}
                </p>
              )}
              {design.hotspots.length > 0 && (
                <p className="text-xs text-dark-500 dark:text-dark-400">
                  Tap a marked area to see its details.
                </p>
              )}
            </div>

            <aside className="space-y-3">
              {selected && (
                <HotspotDetail
                  label={selected.label}
                  notes={selected.notes}
                  item={selected.item}
                  dimensions={selected.dimensions}
                  labourCost={selected.labour_cost}
                  onClose={() => setSelectedId(null)}
                />
              )}
              {design.hotspots.length > 0 && (
                <ul className="space-y-1">
                  {design.hotspots.map((h, i) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(h.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                          h.id === selectedId
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-600/20 dark:text-primary-300'
                            : 'text-dark-700 hover:bg-dark-100 dark:text-dark-200 dark:hover:bg-dark-800'
                        }`}
                      >
                        <span className="mr-2 text-dark-400">{i + 1}.</span>
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

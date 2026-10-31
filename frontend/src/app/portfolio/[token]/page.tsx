'use client';

import {
  GridSkeleton,
  LoadingRegion,
  PageHeaderSkeleton,
} from '@/components/ui';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import {
  CustomerFooter,
  ThemeButton,
} from '@/components/shared/CustomerChrome';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SharedLinkError } from '@/components/shared/SharedLinkError';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { Modal } from '@/components/ui/Modal';
import { getPortfolioView } from '@/lib/designs';
import { useSharedLink } from '@/lib/hooks/useSharedLink';

/** Public showcase of a business's portfolio designs and their hotspots. */
export default function PortfolioPage() {
  const { token } = useParams<{ token: string }>();
  const { state, retry, onImageError } = useSharedLink(token, getPortfolioView);
  const [designId, setDesignId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <LoadingRegion label="Loading portfolio" className="space-y-6">
          <PageHeaderSkeleton />
          <GridSkeleton items={6} itemClassName="h-56" />
        </LoadingRegion>
      </main>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <SharedLinkError subject="portfolio" gone={state.gone} onRetry={retry} />
    );
  }

  const { view } = state;
  const design = view.designs.find((d) => d.id === designId) ?? null;
  const selected = design?.hotspots.find((h) => h.id === selectedId) ?? null;

  const index = view.designs.findIndex((d) => d.id === designId);

  const close = () => {
    setDesignId(null);
    setSelectedId(null);
  };
  const step = (delta: number) => {
    const n = view.designs.length;
    if (n < 2 || index < 0) return;
    setDesignId(view.designs[(index + delta + n) % n].id);
    setSelectedId(null);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold text-dark-900 dark:text-white">
            {view.business_name ?? 'Portfolio'}
          </h1>
          <p className="text-sm text-dark-500 dark:text-dark-400">
            Selected work. Open a design and tap the marked areas to see what
            went into it.
          </p>
        </div>
        <ThemeButton />
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
                      loading="lazy"
                      decoding="async"
                      src={d.thumb_url ?? d.image_url}
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
          maxWidth="6xl"
        >
          <div
            className="space-y-3"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') step(-1);
              else if (e.key === 'ArrowRight') step(1);
            }}
          >
            {view.designs.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous design"
                  className="btn-secondary min-w-11"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <p className="text-sm text-dark-500 dark:text-dark-400">
                  {index + 1} of {view.designs.length}
                </p>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next design"
                  className="btn-secondary min-w-11"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            )}
            {design.image_url && (
              <HotspotImage
                src={design.image_url}
                alt={design.title || 'Design'}
                hotspots={design.hotspots}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onImageError={onImageError}
                zoomable
              />
            )}
            {selected && (
              <HotspotDetail
                popup
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

      <CustomerFooter businessName={view.business_name} />
    </main>
  );
}

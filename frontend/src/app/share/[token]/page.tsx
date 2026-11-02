'use client';

import {
  LoadingRegion,
  PageHeaderSkeleton,
  Skeleton,
  SkeletonImage,
} from '@/components/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SharedLinkError } from '@/components/shared/SharedLinkError';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CustomerFooter,
  PrintButton,
  ThemeButton,
} from '@/components/shared/CustomerChrome';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { HotspotList } from '@/components/designs/HotspotList';
import { getSharedView } from '@/lib/designs';
import { useSharedLink } from '@/lib/hooks/useSharedLink';

/** Public, view-only gallery reached from a designer's share link. */
export default function SharedDesignPage() {
  const { token } = useParams<{ token: string }>();
  const { state, retry, onImageError } = useSharedLink(token, getSharedView);
  const [designId, setDesignId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
      <SharedLinkError subject="design" gone={state.gone} onRetry={retry} />
    );
  }

  const { view } = state;
  // Default to the first image until the visitor picks another.
  const activeId = designId ?? view.designs[0]?.id ?? null;
  const design = view.designs.find((d) => d.id === activeId) ?? null;
  const selected = design?.hotspots.find((h) => h.id === selectedId) ?? null;
  const index = view.designs.findIndex((d) => d.id === activeId);

  const go = (id: string) => {
    setDesignId(id);
    setSelectedId(null);
  };
  const step = (delta: number) => {
    const n = view.designs.length;
    go(view.designs[(index + delta + n) % n].id);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {view.business_name && (
            <p className="type-label">{view.business_name}</p>
          )}
          <h1 className="font-heading text-2xl font-bold text-text">
            {view.project_name}
          </h1>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ThemeButton />
        </div>
      </header>

      {!design ? (
        <p className="text-sm text-muted">Nothing has been shared yet.</p>
      ) : (
        <>
          {view.designs.length > 1 && (
            <nav
              className="flex gap-2 overflow-x-auto pb-1 print:hidden"
              aria-label="Images"
            >
              {view.designs.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => go(d.id)}
                  aria-current={d.id === design.id ? 'true' : undefined}
                  aria-label={d.title || `Image ${i + 1}`}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-surface-2 ${
                    d.id === design.id
                      ? 'border-brand'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  {d.image_url ? (
                    <SkeletonImage
                      loading="lazy"
                      src={d.thumb_url ?? d.image_url}
                      alt=""
                      onError={onImageError}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="px-1 text-xs text-muted">
                      {d.title || i + 1}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="space-y-3">
            <div className="space-y-3">
              {design.image_url && (
                <HotspotImage
                  src={design.image_url}
                  alt={design.title || 'Design'}
                  hotspots={design.hotspots}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  onImageError={onImageError}
                  zoomable
                />
              )}
              {view.designs.length > 1 && (
                <div className="flex items-center justify-between gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous image"
                    className="btn-secondary min-w-11"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <p className="text-sm text-muted" aria-live="polite">
                    {index + 1} of {view.designs.length}
                    {design.title ? ` · ${design.title}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next image"
                    className="btn-secondary min-w-11"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              )}
              {design.description && (
                <p className="text-sm text-muted">{design.description}</p>
              )}
              {design.hotspots.length > 0 && (
                <p className="text-xs text-faint">
                  Tap a marked area to see its details.
                </p>
              )}
            </div>

            {selected && (
              <HotspotDetail
                popup
                label={selected.label}
                notes={selected.notes}
                item={selected.item}
                dimensions={selected.dimensions}
                labourCost={selected.labour_cost}
                onClose={() => setSelectedId(null)}
              />
            )}
            {design.hotspots.length > 0 && (
              <div className="surface p-2">
                <HotspotList
                  hotspots={design.hotspots}
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  onSelect={setSelectedId}
                  onHover={setHoveredId}
                />
              </div>
            )}
          </div>
        </>
      )}

      <CustomerFooter businessName={view.business_name} />
    </main>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MapPin, Pencil, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { PortfolioShareModal } from '@/components/designs/PortfolioShareModal';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { Modal } from '@/components/ui/Modal';
import { listPortfolioDesigns, setDesignInPortfolio } from '@/lib/designs';
import type { PortfolioDesign } from '@/lib/schemas/design';
import { errorMessage } from '@/lib/errors';

const DESIGNS_KEY = ['portfolio-designs'];

/** The designs a designer has chosen to showcase, with preview, edit and share. */
export default function PortfolioPage() {
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  const { data: designs = [], isLoading } = useQuery<PortfolioDesign[]>({
    queryKey: DESIGNS_KEY,
    queryFn: listPortfolioDesigns,
  });
  const preview = designs.find((d) => d.id === previewId) ?? null;
  const selected = preview?.hotspots.find((h) => h.id === selectedId) ?? null;

  const remove = useMutation({
    mutationFn: (design: PortfolioDesign) =>
      setDesignInPortfolio(design.client_id, design.id, false),
    onSuccess: (design) => {
      qc.invalidateQueries({ queryKey: DESIGNS_KEY });
      qc.invalidateQueries({ queryKey: ['designs', design.client_id] });
      setPreviewId(null);
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(design.id);
        return next;
      });
      toast.success('Removed from portfolio');
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to update portfolio')),
  });

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const closePreview = () => {
    setPreviewId(null);
    setSelectedId(null);
  };

  return (
    <div className="space-y-6">
      <TopBarActions>
        <button
          onClick={() => setSharing(true)}
          disabled={picked.size === 0}
          className="btn-secondary"
        >
          <Share2 className="h-4 w-4" />
          Share{picked.size > 0 ? ` (${picked.size})` : ''}
        </button>
      </TopBarActions>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg bg-gray-200 dark:bg-dark-800"
            />
          ))}
        </div>
      ) : designs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-dark-500 dark:border-dark-700 dark:text-dark-400">
          Nothing here yet. Tick &quot;In portfolio&quot; on a design in a
          client&apos;s Designs page to showcase it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design) => (
            <div
              key={design.id}
              className={`space-y-3 rounded-lg border bg-white p-4 shadow-sm dark:bg-dark-800 ${
                picked.has(design.id)
                  ? 'border-primary-500 ring-2 ring-primary-500'
                  : 'border-gray-300 dark:border-dark-700'
              }`}
            >
              {design.image_url && (
                <button
                  type="button"
                  onClick={() => togglePicked(design.id)}
                  aria-pressed={picked.has(design.id)}
                  aria-label={`Select ${design.title || 'design'} to share`}
                  className="relative block w-full overflow-hidden rounded"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={design.image_url}
                    alt={design.title || 'Design'}
                    className="h-40 w-full object-cover"
                  />
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                    <MapPin className="h-3 w-3" />
                    {design.hotspots.length}
                  </span>
                </button>
              )}
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  {design.title || 'Untitled'}
                </p>
                <Link
                  href={`/dashboard/clients/${design.client_id}/designs`}
                  className="text-xs text-dark-500 hover:text-primary-600 hover:underline dark:text-dark-400 dark:hover:text-primary-400"
                >
                  {design.client_name} →
                </Link>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewId(design.id)}
                  className="btn-secondary flex-1 py-1.5 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
                <Link
                  href={`/dashboard/clients/${design.client_id}/designs?edit=${design.id}`}
                  className="btn-secondary flex-1 py-1.5 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <Modal
          open
          onClose={closePreview}
          title={preview.title || 'Design'}
          description={preview.description ?? undefined}
          maxWidth="4xl"
        >
          <div className="space-y-3">
            {preview.image_url && (
              <HotspotImage
                src={preview.image_url}
                alt={preview.title || 'Design'}
                hotspots={preview.hotspots}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            {selected && (
              // Mirrors the customer view: material names, never rates.
              <HotspotDetail
                label={selected.label}
                notes={selected.notes}
                dimensions={selected.dimensions}
                item={
                  selected.material
                    ? {
                        name: selected.material.name,
                        category: selected.material.category,
                        unit: selected.material.unit,
                      }
                    : null
                }
                onClose={() => setSelectedId(null)}
              />
            )}
            {preview.hotspots.length > 0 && !selected && (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                This is what customers see. Tap a marked area for details.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => remove.mutate(preview)}
                disabled={remove.isPending}
                className="btn-secondary text-red-600 dark:text-red-400"
              >
                Remove from portfolio
              </button>
            </div>
          </div>
        </Modal>
      )}
      {sharing && (
        <PortfolioShareModal
          designIds={[...picked]}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

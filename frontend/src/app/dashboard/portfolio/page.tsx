'use client';

import {
  EmptyState,
  ErrorState,
  GridSkeleton,
  SkeletonImage,
} from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { PortfolioShareModal } from '@/components/designs/PortfolioShareModal';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { Modal } from '@/components/ui/Modal';
import {
  listPortfolioDesigns,
  setDesignInPortfolio,
  setPortfolioOrder,
} from '@/lib/designs';
import { moveId } from '@/lib/portfolioOrder';
import { filterByRoom, roomOptions } from '@/lib/portfolioFilter';
import { AddToPortfolioModal } from '@/components/designs/AddToPortfolioModal';
import type { PortfolioDesign } from '@/lib/schemas/design';
import { errorMessage } from '@/lib/errors';

const DESIGNS_KEY = ['portfolio-designs'];

/** The designs a designer has chosen to showcase, with preview, edit and share. */
export default function PortfolioPage() {
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<'create' | 'manage' | null>(null);
  const [adding, setAdding] = useState(false);
  const [room, setRoom] = useState('');

  const {
    data: allDesigns = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<PortfolioDesign[]>({
    queryKey: DESIGNS_KEY,
    queryFn: listPortfolioDesigns,
  });
  const rooms = roomOptions(allDesigns);
  // A room that no longer exists (design removed) must not leave an empty page.
  const activeRoom = rooms.includes(room) ? room : '';
  const designs = filterByRoom(allDesigns, activeRoom);
  const preview = designs.find((d) => d.id === previewId) ?? null;
  const selected = preview?.hotspots.find((h) => h.id === selectedId) ?? null;

  const reorder = useMutation({
    mutationFn: setPortfolioOrder,
    // Show the new order at once; put the server's back if saving fails.
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: DESIGNS_KEY });
      const previous = qc.getQueryData<PortfolioDesign[]>(DESIGNS_KEY);
      qc.setQueryData<PortfolioDesign[]>(DESIGNS_KEY, (old = []) =>
        ids
          .map((id) => old.find((d) => d.id === id))
          .filter((d): d is PortfolioDesign => d !== undefined)
      );
      return { previous };
    },
    onError: (e, _ids, context) => {
      qc.setQueryData(DESIGNS_KEY, context?.previous);
      toast.error(errorMessage(e, 'Failed to save the order'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: DESIGNS_KEY }),
  });
  const move = (id: string, delta: -1 | 1) => {
    const ids = allDesigns.map((d) => d.id);
    const next = moveId(ids, id, delta);
    if (next !== ids) reorder.mutate(next);
  };

  const refreshLists = (clientId: string) => {
    qc.invalidateQueries({ queryKey: DESIGNS_KEY });
    qc.invalidateQueries({ queryKey: ['designs', clientId] });
  };

  const restore = useMutation({
    mutationFn: (design: PortfolioDesign) =>
      setDesignInPortfolio(design.client_id, design.id, true),
    onSuccess: (_, design) => {
      refreshLists(design.client_id);
      toast.success('Back in portfolio');
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to restore design')),
  });

  const remove = useMutation({
    mutationFn: (design: PortfolioDesign) =>
      setDesignInPortfolio(design.client_id, design.id, false),
    onSuccess: (_, design) => {
      refreshLists(design.client_id);
      setPreviewId(null);
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(design.id);
        return next;
      });
      toast.success('Removed from portfolio', {
        action: { label: 'Undo', onClick: () => restore.mutate(design) },
      });
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to update portfolio')),
  });

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const allPicked = designs.length > 0 && picked.size === designs.length;
  const toggleAllPicked = () =>
    setPicked(allPicked ? new Set() : new Set(designs.map((d) => d.id)));
  // With nothing ticked, "Share portfolio" covers every design.
  const shareIds = picked.size > 0 ? [...picked] : designs.map((d) => d.id);

  const closePreview = () => {
    setPreviewId(null);
    setSelectedId(null);
  };

  return (
    <div className="space-y-6">
      <TopBarActions>
        <div className="flex flex-wrap items-center gap-2">
          {designs.length === 0 && !isLoading && (
            <span className="text-xs text-dark-500 dark:text-dark-400">
              Add designs to your portfolio to share them.
            </span>
          )}
          {designs.length > 1 && (
            <button onClick={toggleAllPicked} className="btn-secondary">
              {allPicked ? 'Clear' : 'Select all'}
            </button>
          )}
          <button onClick={() => setAdding(true)} className="btn-secondary">
            <Plus className="h-4 w-4" />
            Add designs
          </button>
          <button
            onClick={() => setSharing('manage')}
            className="btn-secondary"
          >
            <Link2 className="h-4 w-4" />
            Shared links
          </button>
          <button
            onClick={() => setSharing('create')}
            disabled={designs.length === 0}
            className="btn-secondary"
          >
            <Share2 className="h-4 w-4" />
            {picked.size > 0 ? `Share (${picked.size})` : 'Share portfolio'}
          </button>
        </div>
      </TopBarActions>

      {rooms.length > 0 && (
        <div
          role="group"
          aria-label="Filter by room"
          className="flex flex-wrap items-center gap-2"
        >
          {['', ...rooms].map((r) => (
            <button
              key={r || 'all'}
              type="button"
              aria-pressed={activeRoom === r}
              onClick={() => setRoom(r)}
              className="filter-chip"
            >
              {r || 'All rooms'}
            </button>
          ))}
          {activeRoom !== '' && (
            <span className="text-xs text-dark-500 dark:text-dark-400">
              Clear the room filter to change the order.
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <GridSkeleton items={3} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load your portfolio.
        </ErrorState>
      ) : designs.length === 0 ? (
        <EmptyState
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn-primary"
            >
              Add designs
            </button>
          }
        >
          Nothing in your portfolio yet. Add designs from any client.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design, index) => (
            <div
              key={design.id}
              className={`surface space-y-3 p-4 ${
                picked.has(design.id)
                  ? '!border-primary-500 ring-2 ring-primary-500'
                  : ''
              }`}
            >
              {design.image_url && (
                <div className="relative overflow-hidden rounded">
                  <button
                    type="button"
                    onClick={() => setPreviewId(design.id)}
                    aria-label={`Preview ${design.title || 'design'}`}
                    className="block w-full"
                  >
                    <SkeletonImage
                      loading="lazy"
                      src={design.thumb_url ?? design.image_url}
                      alt={design.title || 'Design'}
                      className="h-40 w-full object-cover"
                    />
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-control bg-black/60 px-2 py-0.5 text-xs text-white">
                      <MapPin className="h-3 w-3" />
                      {design.hotspots.length}
                    </span>
                  </button>
                  <label className="absolute left-2 top-2 flex min-h-control cursor-pointer items-center gap-2 rounded-control bg-black/60 px-3 text-xs font-medium text-white">
                    <input
                      type="checkbox"
                      checked={picked.has(design.id)}
                      onChange={() => togglePicked(design.id)}
                      aria-label={`Select ${design.title || 'design'} to share`}
                      className="h-4 w-4"
                    />
                    Select
                  </label>
                </div>
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
                  onClick={() => move(design.id, -1)}
                  disabled={
                    index === 0 || reorder.isPending || activeRoom !== ''
                  }
                  aria-label={`Move ${design.title || 'design'} earlier`}
                  className="btn-secondary min-w-11 px-2.5"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(design.id, 1)}
                  disabled={
                    index === designs.length - 1 ||
                    reorder.isPending ||
                    activeRoom !== ''
                  }
                  aria-label={`Move ${design.title || 'design'} later`}
                  className="btn-secondary min-w-11 px-2.5"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewId(design.id)}
                  className="btn-secondary flex-1 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
                <Link
                  href={`/dashboard/clients/${design.client_id}/designs?edit=${design.id}`}
                  className="btn-secondary flex-1 text-xs"
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
      {adding && <AddToPortfolioModal onClose={() => setAdding(false)} />}
      {sharing && (
        <PortfolioShareModal
          designIds={shareIds}
          manageOnly={sharing === 'manage'}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}

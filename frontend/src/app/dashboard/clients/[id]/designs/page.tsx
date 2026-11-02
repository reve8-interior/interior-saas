'use client';

import { GridSkeleton, SkeletonImage } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MapPin, Share2, Star, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { DesignEditor } from '@/components/designs/DesignEditor';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { RoomTagsModal } from '@/components/designs/RoomTagsModal';
import { ShareModal } from '@/components/designs/ShareModal';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Modal } from '@/components/ui/Modal';
import { RowMenu } from '@/components/ui/RowMenu';
import { SwitchTrack } from '@/components/ui/Switch';
import { DesignStatus } from '@/components/designs/DesignStatus';
import {
  deleteDesign,
  listDesigns,
  selectDesign,
  setDesignInPortfolio,
  uploadDesignImage,
} from '@/lib/designs';
import type { Design } from '@/lib/schemas/design';
import type { Quotation } from '@/lib/schemas/quotation';
import { getQuotation } from '@/lib/quotation';
import { errorMessage } from '@/lib/errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 8;
const HINT_KEY = 'portfolio-showcase-hint-dismissed';

export default function DesignsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('edit')
  );
  const [initialHotspotId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('hotspot')
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState<Design | null>(null);
  const [tagging, setTagging] = useState<Design | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && !!localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Storage unavailable; the note just reappears next visit.
    }
  };

  const {
    data: designs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Design[]>({
    queryKey: ['designs', id],
    queryFn: () => listDesigns(id),
  });
  // Prices of the client's quotation lines, to total what each design adds up to.
  const { data: quotation } = useQuery<Quotation>({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id),
    retry: false,
  });
  const priceByLineId = new Map<string, number>(
    (quotation?.rooms ?? []).flatMap((r) =>
      r.items.map(
        (i) =>
          [i.id, i.negotiated_price ?? i.initial_price ?? 0] as [string, number]
      )
    )
  );
  const editing = designs.find((d) => d.id === editingId) ?? null;
  const preview = designs.find((d) => d.id === previewId) ?? null;
  const previewHotspot = preview?.hotspots.find((h) => h.id === hotspotId);
  const closePreview = () => {
    setPreviewId(null);
    setHotspotId(null);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['designs', id] });

  /** Validate the chosen/dropped images; invalid ones are skipped with one message. */
  const pickFiles = (picked: File[]) => {
    const problems: string[] = [];
    const ok = picked.filter((f) => {
      if (!ACCEPT.split(',').includes(f.type)) {
        problems.push(`${f.name}: not a JPEG, PNG or WebP image`);
        return false;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        problems.push(`${f.name}: larger than ${MAX_MB} MB`);
        return false;
      }
      return true;
    });
    setFiles(ok);
    setFileError(problems.length ? problems.join('. ') : null);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ title: '', description: '' });
    setFiles([]);
    setFileError(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = useMutation({
    // One by one so a failure keeps the earlier images and reports progress.
    mutationFn: async () => {
      const uploaded: Design[] = [];
      for (const [index, f] of files.entries()) {
        setProgress({ done: index, total: files.length });
        const title =
          files.length === 1
            ? form.title
            : form.title || f.name.replace(/\.[^.]+$/, '');
        uploaded.push(await uploadDesignImage(id, f, title, form.description));
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      refresh();
      closeForm();
      if (uploaded.length === 1) {
        toast.success('Image uploaded — now mark the items in it');
        setEditingId(uploaded[0].id);
      } else {
        toast.success(`${uploaded.length} images uploaded`);
      }
    },
    onError: (e) => {
      refresh();
      setProgress(null);
      toast.error(errorMessage(e, 'Failed to upload image'));
    },
  });

  const select = useMutation({
    mutationFn: (designId: string) => selectDesign(id, designId),
    onSuccess: () => {
      refresh();
      toast.success("Marked as the client's favourite");
    },
    onError: () => toast.error('Failed to select design'),
  });

  const portfolio = useMutation({
    mutationFn: (design: Design) =>
      setDesignInPortfolio(id, design.id, !design.in_portfolio),
    onSuccess: (design) => {
      refresh();
      qc.invalidateQueries({ queryKey: ['portfolio-designs'] });
      toast.success(
        design.in_portfolio ? 'Added to portfolio' : 'Removed from portfolio'
      );
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to update portfolio')),
  });

  const allPicked = designs.length > 0 && picked.size === designs.length;
  const toggleAllPicked = () =>
    setPicked(allPicked ? new Set() : new Set(designs.map((d) => d.id)));

  const pickedDesigns = designs.filter((d) => picked.has(d.id));
  const canAddToPortfolio = pickedDesigns.some((d) => !d.in_portfolio);
  const canRemoveFromPortfolio = pickedDesigns.some((d) => d.in_portfolio);

  const bulkPortfolio = useMutation({
    mutationFn: (add: boolean) =>
      Promise.all(
        designs
          .filter((d) => picked.has(d.id) && d.in_portfolio !== add)
          .map((d) => setDesignInPortfolio(id, d.id, add))
      ),
    onSuccess: (_, add) => {
      refresh();
      qc.invalidateQueries({ queryKey: ['portfolio-designs'] });
      toast.success(add ? 'Added to portfolio' : 'Removed from portfolio');
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to update portfolio')),
  });

  const togglePicked = (designId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(designId)) next.add(designId);
      return next;
    });

  const remove = useMutation({
    mutationFn: (designId: string) => deleteDesign(id, designId),
    onSuccess: (_, deletedId) => {
      refresh();
      setDeleting(null);
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      toast.success('Design deleted');
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to delete design')),
  });

  return (
    <div className="space-y-6">
      <TopBarActions>
        <div className="flex gap-2">
          {designs.length > 1 && (
            <button onClick={toggleAllPicked} className="btn-secondary">
              {allPicked ? 'Clear' : 'Select all'}
            </button>
          )}
          <button
            onClick={() => setSharing(true)}
            disabled={picked.size === 0}
            title={picked.size === 0 ? 'Select designs first' : undefined}
            className="btn-secondary"
          >
            <Share2 className="h-4 w-4" />
            Share{picked.size > 0 ? ` (${picked.size})` : ''}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-banner-primary"
          >
            + Upload Image
          </button>
        </div>
      </TopBarActions>

      {picked.size === 0 && designs.length > 0 && (
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Select designs to share them or add them to your portfolio.
        </p>
      )}

      {picked.size > 0 && (
        <div
          role="region"
          aria-label="Selected designs"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-500/40 dark:bg-primary-600/10"
        >
          <span className="mr-auto text-sm font-medium text-dark-900 dark:text-white">
            {picked.size} selected
          </span>
          <button
            type="button"
            onClick={() => bulkPortfolio.mutate(true)}
            disabled={bulkPortfolio.isPending || !canAddToPortfolio}
            title={canAddToPortfolio ? undefined : 'Already in your portfolio'}
            className="btn-secondary"
          >
            Add to portfolio
          </button>
          <button
            type="button"
            onClick={() => bulkPortfolio.mutate(false)}
            disabled={bulkPortfolio.isPending || !canRemoveFromPortfolio}
            title={canRemoveFromPortfolio ? undefined : 'Not in your portfolio'}
            className="btn-secondary"
          >
            Remove from portfolio
          </button>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="btn-secondary"
          >
            Clear
          </button>
        </div>
      )}

      <Modal open={showForm} onClose={closeForm} title="Upload Image">
        <div className="space-y-3">
          <div>
            <label htmlFor="design-files" className="field-label">
              Images * (JPEG, PNG or WebP, up to {MAX_MB} MB each)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFiles([...e.dataTransfer.files]);
              }}
              className={`mb-2 rounded-xl border-2 border-dashed p-4 text-center text-sm text-dark-500 dark:text-dark-400 ${
                dragOver
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-600/10'
                  : 'border-line'
              }`}
            >
              Drop images here, or choose below
            </div>
            <input
              id="design-files"
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(e) => pickFiles([...(e.target.files ?? [])])}
              className="block w-full text-sm text-dark-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-500 dark:text-dark-300"
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-dark-600 dark:text-dark-300">
                {files.map((f) => (
                  <li key={f.name + f.size} className="truncate">
                    {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                  </li>
                ))}
              </ul>
            )}
            {fileError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fileError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="design-title" className="field-label">
              {files.length > 1 ? 'Title (blank = use file names)' : 'Title'}
            </label>
            <input
              id="design-title"
              value={form.title}
              maxLength={255}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="Living room — TV wall"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="design-description" className="field-label">
              Description
            </label>
            <textarea
              id="design-description"
              value={form.description}
              maxLength={2000}
              rows={2}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Brief description…"
              className="field"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={closeForm} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => upload.mutate()}
              disabled={files.length === 0 || upload.isPending}
              className="btn-banner-primary"
            >
              {upload.isPending
                ? `Uploading ${(progress?.done ?? 0) + 1} of ${files.length}…`
                : files.length > 1
                  ? `Upload ${files.length} images`
                  : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>

      {isLoading ? (
        <GridSkeleton items={3} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load designs. Check your connection and try again.
        </ErrorState>
      ) : designs.length === 0 ? (
        <EmptyState
          action={
            <button
              onClick={() => setShowForm(true)}
              className="btn-banner-primary"
            >
              + Upload Image
            </button>
          }
        >
          No designs yet. Upload an image to get started.
        </EmptyState>
      ) : (
        <>
          {!hintDismissed && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50/50 p-3 text-sm text-dark-700 dark:border-primary-500/40 dark:bg-primary-600/10 dark:text-dark-300">
              <p>
                Designs set to &quot;Showcase in portfolio&quot; are visible to
                anyone with your portfolio link. Rates are never shown.
              </p>
              <button
                type="button"
                onClick={dismissHint}
                className="btn-secondary shrink-0"
              >
                Got it
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((design) => (
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
                      onClick={() => setEditingId(design.id)}
                      aria-label={`Edit hotspots on ${design.title || 'design'}`}
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
                    <label className="absolute left-2 top-2 flex min-h-control cursor-pointer items-center gap-1.5 rounded-control bg-black/60 px-2.5 text-xs font-medium text-white">
                      <input
                        type="checkbox"
                        checked={picked.has(design.id)}
                        onChange={() => togglePicked(design.id)}
                      />
                      Select
                    </label>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-dark-900 dark:text-white">
                      {design.title || 'Untitled'}
                    </p>
                    <span className="text-xs text-dark-500 dark:text-dark-400">
                      {design.source.replace('_', ' ')}
                    </span>
                  </div>
                  {design.is_selected && (
                    <span className="rounded-control bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                      Client&apos;s favourite
                    </span>
                  )}
                </div>
                <DesignStatus
                  design={design}
                  priceByLineId={priceByLineId}
                  onReview={() => setEditingId(design.id)}
                />
                {design.description && (
                  <p className="text-xs text-dark-600 dark:text-dark-400">
                    {design.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {design.rooms.map((room) => (
                    <span
                      key={room}
                      className="rounded-control bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-600/20 dark:text-primary-300"
                    >
                      {room}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTagging(design)}
                    className="link-action inline-flex items-center text-xs"
                  >
                    {design.rooms.length > 0 ? 'Change rooms' : '+ Assign room'}
                  </button>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={design.in_portfolio}
                  aria-label={`Showcase ${design.title || 'design'} in portfolio`}
                  disabled={portfolio.isPending}
                  onClick={() => portfolio.mutate(design)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left text-sm text-dark-700 disabled:opacity-50 dark:text-dark-300"
                >
                  <SwitchTrack checked={design.in_portfolio} />
                  Showcase in portfolio
                </button>
                <div className="flex flex-wrap gap-2">
                  {design.image_url && (
                    <>
                      <button
                        onClick={() => setPreviewId(design.id)}
                        className="btn-secondary flex-1 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Customer view
                      </button>
                      <button
                        onClick={() => setEditingId(design.id)}
                        className="btn-secondary flex-1 text-xs"
                      >
                        Edit hotspots
                      </button>
                    </>
                  )}
                  <RowMenu
                    label={`More actions for ${design.title || 'design'}`}
                    items={[
                      ...(design.is_selected
                        ? []
                        : [
                            {
                              label: 'Mark as client’s favourite',
                              icon: <Star className="h-4 w-4" aria-hidden />,
                              disabled: select.isPending,
                              onSelect: () => select.mutate(design.id),
                            },
                          ]),
                      {
                        label: 'Delete design',
                        icon: <Trash2 className="h-4 w-4" aria-hidden />,
                        danger: true,
                        onSelect: () => setDeleting(design),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
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
                selectedId={hotspotId}
                onSelect={setHotspotId}
              />
            )}
            {previewHotspot && (
              <HotspotDetail
                label={previewHotspot.label}
                notes={previewHotspot.notes}
                dimensions={previewHotspot.dimensions}
                labourCost={previewHotspot.labour_cost}
                item={
                  previewHotspot.material
                    ? {
                        name: previewHotspot.material.name,
                        category: previewHotspot.material.category,
                        unit: previewHotspot.material.unit,
                      }
                    : null
                }
                onClose={() => setHotspotId(null)}
              />
            )}
            {preview.hotspots.length > 0 && !previewHotspot && (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                This is what customers see. Tap a marked area for details.
              </p>
            )}
          </div>
        </Modal>
      )}
      {editing && (
        <DesignEditor
          clientId={id}
          design={editing}
          initialHotspotId={initialHotspotId}
          onClose={() => {
            setEditingId(null);
            // Drop ?edit= so a refresh doesn't reopen the editor.
            const url = new URL(window.location.href);
            if (url.searchParams.has('edit')) {
              url.searchParams.delete('edit');
              url.searchParams.delete('hotspot');
              window.history.replaceState(null, '', url);
            }
          }}
        />
      )}
      {tagging && (
        <RoomTagsModal
          clientId={id}
          design={tagging}
          onClose={() => setTagging(null)}
        />
      )}
      {sharing && (
        <ShareModal
          clientId={id}
          designIds={[...picked]}
          onClose={() => setSharing(false)}
        />
      )}
      <ConfirmDeleteModal
        isOpen={deleting !== null}
        isLoading={remove.isPending}
        title="Delete design"
        description="This removes the image and all its hotspots. Share links will no longer show it."
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

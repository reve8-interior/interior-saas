'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MapPin, Share2, Trash2 } from 'lucide-react';
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
import {
  deleteDesign,
  listDesigns,
  selectDesign,
  setDesignInPortfolio,
  uploadDesignImage,
} from '@/lib/designs';
import type { Design } from '@/lib/schemas/design';
import { errorMessage } from '@/lib/errors';
import { EmptyState } from '@/components/ui/EmptyState';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 8;

export default function DesignsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('edit')
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState<Design | null>(null);
  const [tagging, setTagging] = useState<Design | null>(null);

  const { data: designs = [], isLoading } = useQuery<Design[]>({
    queryKey: ['designs', id],
    queryFn: () => listDesigns(id),
  });
  const editing = designs.find((d) => d.id === editingId) ?? null;
  const preview = designs.find((d) => d.id === previewId) ?? null;
  const previewHotspot = preview?.hotspots.find((h) => h.id === hotspotId);
  const closePreview = () => {
    setPreviewId(null);
    setHotspotId(null);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['designs', id] });

  const pickFile = (picked: File | null) => {
    setFile(picked);
    setFileError(null);
    if (!picked) return;
    if (!ACCEPT.split(',').includes(picked.type)) {
      setFileError('Choose a JPEG, PNG or WebP image');
      setFile(null);
    } else if (picked.size > MAX_MB * 1024 * 1024) {
      setFileError(`Image must be ${MAX_MB} MB or smaller`);
      setFile(null);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ title: '', description: '' });
    pickFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = useMutation({
    mutationFn: () =>
      uploadDesignImage(id, file as File, form.title, form.description),
    onSuccess: (design) => {
      refresh();
      toast.success('Image uploaded — now mark the items in it');
      closeForm();
      setEditingId(design.id);
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to upload image')),
  });

  const select = useMutation({
    mutationFn: (designId: string) => selectDesign(id, designId),
    onSuccess: () => {
      refresh();
      toast.success("Marked as the client's pick");
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
          {picked.size > 0 && (
            <button
              onClick={() => bulkPortfolio.mutate(true)}
              disabled={bulkPortfolio.isPending}
              className="btn-secondary"
            >
              Add to portfolio
            </button>
          )}
          <button
            onClick={() => setSharing(true)}
            disabled={picked.size === 0}
            title={
              picked.size === 0 ? 'Tick Share on designs first' : undefined
            }
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

      <Modal open={showForm} onClose={closeForm} title="Upload Image">
        <div className="space-y-3">
          <div>
            <label className="field-label">
              Image * (JPEG, PNG or WebP, up to {MAX_MB} MB)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-dark-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-500 dark:text-dark-300"
            />
            {fileError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fileError}
              </p>
            )}
          </div>
          <div>
            <label className="field-label">Title</label>
            <input
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
            <label className="field-label">Description</label>
            <textarea
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
              disabled={!file || upload.isPending}
              className="btn-banner-primary"
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl bg-primary-50 dark:bg-dark-800"
            />
          ))}
        </div>
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
                    onClick={() => setPreviewId(design.id)}
                    aria-label={`Preview ${design.title || 'design'}`}
                    className="block w-full"
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
                  <label className="absolute left-2 top-2 flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-xs font-medium text-white">
                    <input
                      type="checkbox"
                      checked={picked.has(design.id)}
                      onChange={() => togglePicked(design.id)}
                    />
                    Share
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
                  <span className="rounded-full bg-gradient-to-r from-primary-600 to-secondary-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                    Client&apos;s pick
                  </span>
                )}
              </div>
              {design.description && (
                <p className="text-xs text-dark-600 dark:text-dark-400">
                  {design.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {design.rooms.map((room) => (
                  <span
                    key={room}
                    className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-600/20 dark:text-primary-300"
                  >
                    {room}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setTagging(design)}
                  className="link-action text-xs"
                >
                  {design.rooms.length > 0 ? 'Change rooms' : '+ Assign room'}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-dark-700 dark:text-dark-300">
                <input
                  type="checkbox"
                  checked={design.in_portfolio}
                  disabled={portfolio.isPending}
                  onChange={() => portfolio.mutate(design)}
                />
                In portfolio
              </label>
              <div className="flex gap-2">
                {design.image_url && (
                  <>
                    <button
                      onClick={() => setPreviewId(design.id)}
                      className="btn-secondary flex-1 py-1.5 text-xs"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={() => setEditingId(design.id)}
                      className="btn-secondary flex-1 py-1.5 text-xs"
                    >
                      Edit hotspots
                    </button>
                  </>
                )}
                {!design.is_selected && (
                  <button
                    onClick={() => select.mutate(design.id)}
                    disabled={select.isPending}
                    className="flex-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs text-primary-700 hover:bg-primary-100 dark:border-transparent dark:bg-primary-600/20 dark:text-primary-400 dark:hover:bg-primary-600/40"
                  >
                    Mark as pick
                  </button>
                )}
                <button
                  onClick={() => setDeleting(design)}
                  aria-label="Delete design"
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
          onClose={() => setEditingId(null)}
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

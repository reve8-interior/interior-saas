'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Crosshair, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { INPUT_CLS } from '@/lib/constants';
import { createHotspot, deleteHotspot, updateHotspot } from '@/lib/designs';
import { fmtRate } from '@/lib/format';
import type { Design, HotspotInput, HotspotRegion } from '@/lib/schemas/design';
import { AddAllToQuotation } from './AddAllToQuotation';
import { AddToQuotationPanel } from './AddToQuotationPanel';
import { HotspotIconPicker } from './HotspotIconPicker';
import { HotspotImage } from './HotspotImage';
import { HotspotList } from './HotspotList';
import { errorMessage } from '@/lib/errors';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
}

interface DesignEditorProps {
  clientId: string;
  design: Design;
  /** Open with this hotspot selected, e.g. from a quotation line's link. */
  initialHotspotId?: string | null;
  onClose: () => void;
}

interface FormState {
  label: string;
  material_id: string;
  notes: string;
  dimensions: string;
  /** '' = guess from the label. */
  icon: string;
  labour_cost: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  material_id: '',
  notes: '',
  dimensions: '',
  icon: '',
  labour_cost: '',
};

/** Designer's hotspot editor: draw regions on the image and link materials. */
export function DesignEditor({
  clientId,
  design,
  initialHotspotId,
  onClose,
}: DesignEditorProps) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  // An add session: stays on after each save so several spots go in a row.
  const [adding, setAdding] = useState(false);
  const [region, setRegion] = useState<HotspotRegion | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  // What to do once the designer confirms losing unsaved details.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => api.get<Material[]>('/materials'),
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['designs', clientId] });

  const reset = () => {
    setSelectedId(null);
    setRegion(null);
    setForm(null);
    setDrawing(false);
    setAdding(false);
  };

  /** Next spot: clear the form and go straight back to drawing. */
  const nextSpot = () => {
    setSelectedId(null);
    setRegion(null);
    setForm(null);
    setDrawing(true);
  };

  const save = useMutation({
    mutationFn: (body: HotspotInput) =>
      selectedId
        ? updateHotspot(clientId, design.id, selectedId, body)
        : createHotspot(clientId, design.id, body),
    onSuccess: () => {
      refresh();
      toast.success('Hotspot saved');
      // A new spot keeps the add session going; an edit just stays open.
      if (!selectedId) nextSpot();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const restore = useMutation({
    mutationFn: (body: HotspotInput) =>
      createHotspot(clientId, design.id, body),
    onSuccess: () => {
      refresh();
      toast.success('Hotspot restored');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /** Dragging a hotspot saves its new position straight away. */
  const move = useMutation({
    mutationFn: ({ id, region: to }: { id: string; region: HotspotRegion }) => {
      const h = design.hotspots.find((x) => x.id === id);
      if (!h) throw new Error('Hotspot not found');
      return updateHotspot(clientId, design.id, id, {
        ...to,
        label: h.label,
        notes: h.notes,
        material_id: h.material_id,
        dimensions: h.dimensions,
        icon: h.icon,
        labour_cost: h.labour_cost != null ? Number(h.labour_cost) : null,
      });
    },
    onSuccess: (_, { id, region: to }) => {
      refresh();
      if (id === selectedId) setRegion(to);
      toast.success('Hotspot moved');
    },
    onError: (e) => {
      refresh();
      toast.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteHotspot(clientId, design.id, id),
    onSuccess: (_, id) => {
      const gone = design.hotspots.find((h) => h.id === id);
      refresh();
      reset();
      toast.success('Hotspot deleted', {
        duration: 8000,
        action: gone
          ? {
              label: 'Undo',
              onClick: () =>
                restore.mutate({
                  x: gone.x,
                  y: gone.y,
                  w: gone.w,
                  h: gone.h,
                  label: gone.label,
                  notes: gone.notes,
                  material_id: gone.material_id,
                  dimensions: gone.dimensions,
                  icon: gone.icon,
                  labour_cost:
                    gone.labour_cost != null ? Number(gone.labour_cost) : null,
                }),
            }
          : undefined,
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const select = (id: string | null) => {
    const hotspot = design.hotspots.find((h) => h.id === id);
    setDrawing(false);
    setAdding(false);
    setSelectedId(id);
    if (!hotspot) {
      setRegion(null);
      setForm(null);
      return;
    }
    setRegion({ x: hotspot.x, y: hotspot.y, w: hotspot.w, h: hotspot.h });
    setForm({
      label: hotspot.label,
      material_id: hotspot.material_id ?? '',
      notes: hotspot.notes ?? '',
      dimensions: hotspot.dimensions ?? '',
      icon: hotspot.icon ?? '',
      labour_cost:
        hotspot.labour_cost != null ? String(hotspot.labour_cost) : '',
    });
  };

  // Arriving from a quotation line: land on the hotspot it came from.
  useEffect(() => {
    if (initialHotspotId) select(initialHotspotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDraw = (drawn: HotspotRegion) => {
    setRegion(drawn);
    setDrawing(false);
    setForm((prev) => prev ?? EMPTY_FORM);
  };

  const chooseMaterial = (materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    setForm((prev) =>
      prev
        ? {
            ...prev,
            material_id: materialId,
            // Pre-fill the label only when the designer hasn't typed one.
            label: prev.label || material?.name || '',
          }
        : prev
    );
  };

  const submit = () => {
    if (!form || !region) return;
    if (!form.label.trim()) {
      toast.error('Give the hotspot a label');
      document.getElementById('hotspot-label')?.focus();
      return;
    }
    const labour = form.labour_cost.trim();
    if (labour && !(Number(labour) >= 0)) {
      toast.error('Labour cost must be a positive number');
      return;
    }
    save.mutate({
      ...region,
      dimensions: form.dimensions.trim() || null,
      icon: form.icon || null,
      labour_cost: labour ? Number(labour) : null,
      label: form.label.trim(),
      notes: form.notes.trim() || null,
      material_id: form.material_id || null,
    });
  };

  // Unsaved when a new spot has a drawn area or typed details, or an edit differs
  // from the stored hotspot.
  const original = design.hotspots.find((h) => h.id === selectedId);
  const dirty =
    form !== null &&
    (original
      ? form.label !== original.label ||
        form.material_id !== (original.material_id ?? '') ||
        form.notes !== (original.notes ?? '') ||
        form.dimensions !== (original.dimensions ?? '') ||
        form.icon !== (original.icon ?? '') ||
        form.labour_cost !==
          (original.labour_cost != null ? String(original.labour_cost) : '')
      : region !== null ||
        (Object.keys(EMPTY_FORM) as (keyof FormState)[]).some(
          (k) => form[k] !== EMPTY_FORM[k]
        ));

  /** Leaving with unsaved hotspot details asks first instead of losing them. */
  const leave = (action: () => void) =>
    dirty ? setPendingLeave(() => action) : action();
  const requestClose = () => leave(onClose);

  /** Switching hotspots asks first when there are unsaved details; a click on
   *  empty image never throws away a draft. */
  const handleSelect = (id: string | null) => {
    if (id === selectedId) return;
    if (id === null && dirty) return;
    leave(() => select(id));
  };
  const cancelEdit = () => leave(adding && !selectedId ? nextSpot : reset);

  const hasImage = Boolean(design.image_url);
  const selectedHotspot =
    design.hotspots.find((h) => h.id === selectedId) ?? null;

  // Green on the image: already priced in the quotation.
  const linkedIds = new Set(
    design.hotspots.filter((h) => h.quotation_line_item_id).map((h) => h.id)
  );

  return (
    <Modal
      open
      onClose={requestClose}
      title={design.title || 'Design'}
      description="Mark items in the image and link them to your materials"
      maxWidth="6xl"
    >
      {/* The form column grows with its content and the whole editor scrolls;
          the image stays pinned in view beside it on desktop. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-0">
          {hasImage ? (
            <HotspotImage
              src={design.image_url as string}
              alt={design.title || 'Design'}
              hotspots={design.hotspots}
              selectedId={selectedId}
              onSelect={handleSelect}
              drawing={drawing}
              onDraw={onDraw}
              draft={region}
              linkedIds={linkedIds}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onMove={(id, to) => move.mutate({ id, region: to })}
            />
          ) : (
            <p className="text-sm text-dark-500">This design has no image.</p>
          )}
          <p className="text-xs text-dark-500 dark:text-dark-400">
            {drawing
              ? 'Drag over an item to mark it, or click once to drop a pin.'
              : adding
                ? 'Fill in the details and save. You can then mark the next one.'
                : 'Click a marker to edit it, drag it to move it, or add a new hotspot. Green markers are already in the quotation.'}
          </p>
        </div>

        <aside className="space-y-4">
          {form ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  aria-label="Back to hotspots"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-text/5 hover:text-text"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </button>
                <h3 className="font-heading text-base font-semibold text-text">
                  {selectedId ? 'Edit hotspot' : 'New hotspot'}
                </h3>
              </div>

              <section className="surface space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="type-label">Details</h4>
                  {selectedId && (
                    <button
                      type="button"
                      onClick={() => {
                        setRegion(null);
                        setDrawing(true);
                      }}
                      className="inline-flex min-h-11 items-center text-xs text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Redraw area
                    </button>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="hotspot-label"
                    className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
                  >
                    Label *
                  </label>
                  <div className="flex gap-2">
                    <HotspotIconPicker
                      value={form.icon}
                      label={form.label}
                      onChange={(icon) => setForm({ ...form, icon })}
                    />
                    <input
                      id="hotspot-label"
                      autoFocus={!selectedId}
                      value={form.label}
                      maxLength={255}
                      onChange={(e) =>
                        setForm({ ...form, label: e.target.value })
                      }
                      placeholder="Wardrobe, TV wall, Sofa…"
                      className={`${INPUT_CLS} min-w-0 flex-1`}
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="hotspot-material"
                    className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
                  >
                    Material
                  </label>
                  <select
                    id="hotspot-material"
                    value={form.material_id}
                    onChange={(e) => chooseMaterial(e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">None</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.category} · {fmtRate(m.unit_cost)}/
                        {m.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="hotspot-notes"
                    className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
                  >
                    Notes
                  </label>
                  <textarea
                    id="hotspot-notes"
                    value={form.notes}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    placeholder="Finish, size, anything the customer should know"
                    className={INPUT_CLS}
                  />
                </div>
              </section>

              {/* Optional, so it stays folded until there is something in it. */}
              <details
                key={selectedId ?? 'new'}
                open={Boolean(form.dimensions || form.labour_cost)}
                className="surface group"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-text">
                  <span>
                    Size &amp; cost{' '}
                    <span className="font-normal text-muted">· optional</span>
                  </span>
                  <ChevronDown
                    className="h-4 w-4 text-muted transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                  <div>
                    <label
                      htmlFor="hotspot-dimensions"
                      className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
                    >
                      Dimensions
                    </label>
                    <input
                      id="hotspot-dimensions"
                      value={form.dimensions}
                      maxLength={100}
                      onChange={(e) =>
                        setForm({ ...form, dimensions: e.target.value })
                      }
                      placeholder="8ft x 7ft"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="hotspot-labour"
                      className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
                    >
                      Labour cost
                    </label>
                    <input
                      id="hotspot-labour"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.labour_cost}
                      onChange={(e) =>
                        setForm({ ...form, labour_cost: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </details>

              {selectedHotspot ? (
                <AddToQuotationPanel
                  key={selectedHotspot.id}
                  clientId={clientId}
                  designId={design.id}
                  hotspot={selectedHotspot}
                  defaultRoom={design.rooms[0]}
                />
              ) : (
                <p className="text-xs text-muted">
                  Save the hotspot first, then you can add it to the quotation.
                </p>
              )}

              {/* Stays in view however long the form gets. */}
              <div className="sticky bottom-0 z-10 flex items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-glass">
                {selectedId && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(selectedId)}
                    disabled={remove.isPending}
                    aria-label="Delete hotspot"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {dirty && (
                  <span
                    role="status"
                    className="flex min-w-0 items-center gap-1.5 text-xs text-muted"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                      aria-hidden
                    />
                    Unsaved
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="btn-secondary"
                  >
                    {adding && !selectedId ? 'Discard' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={save.isPending}
                    className="btn-primary"
                  >
                    {save.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                disabled={!hasImage}
                onClick={() => {
                  if (adding) return reset();
                  nextSpot();
                  setAdding(true);
                }}
                className={
                  adding ? 'btn-secondary w-full' : 'btn-primary w-full'
                }
              >
                <Crosshair className="h-4 w-4" />
                {adding ? 'Done adding' : 'Add hotspot'}
              </button>

              {design.hotspots.length === 0 && (
                <p className="text-sm text-muted">
                  No hotspots yet. Choose Add hotspot, then click the image to
                  drop a pin or drag to draw a box.
                </p>
              )}

              <HotspotList
                hotspots={design.hotspots}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={handleSelect}
                onHover={setHoveredId}
                linkedIds={linkedIds}
              />

              <AddAllToQuotation
                clientId={clientId}
                design={design}
                defaultRoom={design.rooms[0]}
              />
            </div>
          )}
        </aside>
      </div>
      <ConfirmDeleteModal
        isOpen={pendingLeave !== null}
        isLoading={false}
        title="Discard unsaved changes?"
        description="You have hotspot details that are not saved yet. Leaving now will lose them."
        confirmLabel="Discard"
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          action?.();
        }}
        onCancel={() => setPendingLeave(null)}
      />
    </Modal>
  );
}

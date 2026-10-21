'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { INPUT_CLS } from '@/lib/constants';
import { createHotspot, deleteHotspot, updateHotspot } from '@/lib/designs';
import { fmtRate } from '@/lib/format';
import type { Design, HotspotInput, HotspotRegion } from '@/lib/schemas/design';
import { AddToQuotationPanel } from './AddToQuotationPanel';
import { HotspotImage } from './HotspotImage';
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
  onClose: () => void;
}

interface FormState {
  label: string;
  material_id: string;
  notes: string;
  dimensions: string;
  labour_cost: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  material_id: '',
  notes: '',
  dimensions: '',
  labour_cost: '',
};

/** Designer's hotspot editor: draw regions on the image and link materials. */
export function DesignEditor({ clientId, design, onClose }: DesignEditorProps) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  // An add session: stays on after each save so several spots go in a row.
  const [adding, setAdding] = useState(false);
  const [region, setRegion] = useState<HotspotRegion | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

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

  const remove = useMutation({
    mutationFn: (id: string) => deleteHotspot(clientId, design.id, id),
    onSuccess: () => {
      refresh();
      toast.success('Hotspot deleted');
      reset();
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
      labour_cost:
        hotspot.labour_cost != null ? String(hotspot.labour_cost) : '',
    });
  };

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
      labour_cost: labour ? Number(labour) : null,
      label: form.label.trim(),
      notes: form.notes.trim() || null,
      material_id: form.material_id || null,
    });
  };

  const hasImage = Boolean(design.image_url);
  const selectedHotspot =
    design.hotspots.find((h) => h.id === selectedId) ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      title={design.title || 'Design'}
      description="Mark items in the image and link them to your materials"
      maxWidth="6xl"
    >
      {/* The image column sets the card's height; on desktop the sidebar takes
          that height (h-0 + min-h-full) and scrolls, so the card never grows. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 lg:min-h-[28rem]">
          {hasImage ? (
            <HotspotImage
              src={design.image_url as string}
              alt={design.title || 'Design'}
              hotspots={design.hotspots}
              selectedId={selectedId}
              onSelect={select}
              drawing={drawing}
              onDraw={onDraw}
              draft={region}
            />
          ) : (
            <p className="text-sm text-dark-500">This design has no image.</p>
          )}
          <p className="text-xs text-dark-500 dark:text-dark-400">
            {drawing
              ? 'Drag over an item to mark it, or click once to drop a pin.'
              : adding
                ? 'Fill in the details and save. You can then mark the next one.'
                : 'Click a marker to edit it, or add a new hotspot.'}
          </p>
        </div>

        <aside className="space-y-4 lg:h-0 lg:min-h-full lg:overflow-y-auto lg:pr-1">
          <button
            type="button"
            disabled={!hasImage}
            onClick={() => {
              if (adding) return reset();
              nextSpot();
              setAdding(true);
            }}
            className={adding ? 'btn-secondary w-full' : 'btn-primary w-full'}
          >
            <Crosshair className="h-4 w-4" />
            {adding ? 'Done adding' : 'Add hotspot'}
          </button>

          {form && (
            <div className="surface space-y-3 p-4">
              <div>
                <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
                  Label *
                </label>
                <input
                  value={form.label}
                  maxLength={255}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Wardrobe, TV wall, Sofa…"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
                  Material
                </label>
                <select
                  value={form.material_id}
                  onChange={(e) => chooseMaterial(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">None</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.category} · {fmtRate(m.unit_cost)}/{m.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
                    Dimensions
                  </label>
                  <input
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
                  <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
                    Labour cost
                  </label>
                  <input
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
              <div>
                <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Finish, size, anything the customer should know"
                  className={INPUT_CLS}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                {selectedId ? (
                  <button
                    type="button"
                    onClick={() => remove.mutate(selectedId)}
                    disabled={remove.isPending}
                    aria-label="Delete hotspot"
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      adding && !selectedId ? nextSpot() : reset()
                    }
                    className="btn-secondary"
                  >
                    Cancel
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
              {selectedId && (
                <button
                  type="button"
                  onClick={() => {
                    setRegion(null);
                    setDrawing(true);
                  }}
                  className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                >
                  Redraw area
                </button>
              )}
            </div>
          )}

          {selectedHotspot && (
            <AddToQuotationPanel
              key={selectedHotspot.id}
              clientId={clientId}
              designId={design.id}
              hotspot={selectedHotspot}
            />
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
              Hotspots ({design.hotspots.length})
            </h3>
            {design.hotspots.length === 0 ? (
              <p className="text-sm text-dark-500 dark:text-dark-400">
                None yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {design.hotspots.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => select(h.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        h.id === selectedId
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-600/20 dark:text-primary-300'
                          : 'text-dark-700 hover:bg-dark-100 dark:text-dark-200 dark:hover:bg-dark-700'
                      }`}
                    >
                      <span className="mr-2 text-dark-400">{i + 1}.</span>
                      {h.label}
                      {h.material && (
                        <span className="ml-2 text-xs text-dark-500 dark:text-dark-400">
                          {h.material.name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

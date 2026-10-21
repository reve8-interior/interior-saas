'use client';

import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/ui';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { ModelTierPicker } from '@/components/shared/ModelTierPicker';
import { type ModelTier, useModelTier } from '@/lib/aiModels';
import { api } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { INPUT_CLS } from '@/lib/constants';
import { fmtRate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  vendor: string | null;
  updated_at: string;
}

interface MarginConfig {
  id: string;
  category: string | null;
  margin_percent: number;
}

interface BulkRow {
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  vendor: string | null;
}

type Tab = 'excel' | 'ai' | 'manual';

const btnPrimary = 'btn-primary';
const btnGhost = 'btn-secondary';

const MANUAL_EMPTY = {
  name: '',
  category: '',
  unit: 'sqft',
  unit_cost: '',
  vendor: '',
};

// ── Editable preview table used by Excel + AI tabs ──────────────────────────
function PreviewTable({
  rows,
  onChange,
}: {
  rows: BulkRow[];
  onChange: (rows: BulkRow[]) => void;
}) {
  const set = (i: number, k: keyof BulkRow, v: string) =>
    onChange(
      rows.map((r, idx) =>
        idx === i
          ? { ...r, [k]: k === 'unit_cost' ? parseFloat(v) || 0 : v || null }
          : r
      )
    );

  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-line dark:border-primary-300/15">
      <table className="data-table">
        <thead className="sticky top-0">
          <tr>
            {['Name', 'Category', 'Unit', 'Unit Cost (₹)', 'Vendor', ''].map(
              (h) => (
                <th key={h}>{h}</th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line dark:divide-primary-300/10">
          {rows.map((r, i) => (
            <tr key={i}>
              {(['name', 'category', 'unit'] as const).map((k) => (
                <td key={k} className="px-2 py-1">
                  <input
                    value={r[k]}
                    onChange={(e) => set(i, k, e.target.value)}
                    className={INPUT_CLS}
                  />
                </td>
              ))}
              <td className="px-2 py-1">
                <input
                  type="number"
                  value={r.unit_cost}
                  onChange={(e) => set(i, 'unit_cost', e.target.value)}
                  className={INPUT_CLS}
                />
              </td>
              <td className="px-2 py-1">
                <input
                  value={r.vendor ?? ''}
                  onChange={(e) => set(i, 'vendor', e.target.value)}
                  placeholder="optional"
                  className={INPUT_CLS}
                />
              </td>
              <td className="px-2 py-1">
                <button
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-xs text-dark-500 dark:text-dark-400"
              >
                No rows — upload a file above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Import modal ─────────────────────────────────────────────────────────────
function ImportModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>('excel');
  const [previewRows, setPreviewRows] = useState<BulkRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [manualForm, setManualForm] = useState(MANUAL_EMPTY);
  const excelRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const { options: modelOptions, tier, setTier } = useModelTier();

  const resetPreview = () => {
    setPreviewRows([]);
    setPreviewErrors([]);
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    resetPreview();
  };

  const uploadFile = async (
    endpoint: string,
    file: File,
    ref: React.RefObject<HTMLInputElement | null>,
    aiTier?: ModelTier
  ) => {
    setIsParsing(true);
    resetPreview();
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (aiTier) fd.append('tier', aiTier);
      const res = await api.postForm<{ rows: BulkRow[]; errors: string[] }>(
        endpoint,
        fd
      );
      setPreviewRows(res.rows);
      setPreviewErrors(res.errors);
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Upload failed');
      toast.error(msg);
    } finally {
      setIsParsing(false);
      if (ref.current) ref.current.value = '';
    }
  };

  const confirmBulk = async () => {
    setIsSaving(true);
    try {
      await api.post('/materials/bulk-confirm', {
        rows: previewRows,
        errors: [],
      });
      toast.success(`${previewRows.length} materials saved`);
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to save materials');
    } finally {
      setIsSaving(false);
    }
  };

  const addManual = async () => {
    setIsSaving(true);
    try {
      await api.post('/materials', {
        ...manualForm,
        unit_cost: parseFloat(manualForm.unit_cost),
        vendor: manualForm.vendor || null,
      });
      toast.success('Material added');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to add material');
    } finally {
      setIsSaving(false);
    }
  };

  const setManual =
    (k: keyof typeof manualForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setManualForm((p) => ({ ...p, [k]: e.target.value }));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'excel', label: 'Excel upload' },
    { key: 'ai', label: 'AI extract' },
    { key: 'manual', label: 'Manual' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark-950/60 backdrop-blur-md sm:items-center sm:p-4">
      <div className="flex h-dvh w-full flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-dark-800 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl sm:border sm:border-line sm:p-0 sm:shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] sm:dark:border-primary-300/15">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 dark:border-primary-300/15">
          <h2 className="text-base font-extrabold tracking-tight text-dark-900 dark:text-white">
            Add Materials
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2.5 text-dark-500 hover:bg-primary-50 hover:text-dark-600 dark:text-dark-400 dark:hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs — scroll horizontally if they don't fit */}
        <div className="border-b border-line px-4 py-3 dark:border-primary-300/15 sm:px-6">
          <div role="tablist" className="seg">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => handleTabChange(t.key)}
                className="seg-btn"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-80 space-y-4 p-4 sm:p-6">
          {/* Manual tab */}
          {tab === 'manual' && (
            <div className="flex flex-col gap-3">
              {[
                {
                  label: 'Name *',
                  key: 'name' as const,
                  placeholder: 'Plywood 18mm',
                },
                {
                  label: 'Category *',
                  key: 'category' as const,
                  placeholder: 'plywood',
                },
                { label: 'Unit', key: 'unit' as const, placeholder: 'sqft' },
                {
                  label: 'Unit Cost (₹) *',
                  key: 'unit_cost' as const,
                  placeholder: '85',
                },
                {
                  label: 'Vendor',
                  key: 'vendor' as const,
                  placeholder: 'ABC Traders',
                },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input
                    value={manualForm[key]}
                    onChange={setManual(key)}
                    placeholder={placeholder}
                    className={INPUT_CLS}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Excel tab */}
          {tab === 'excel' && (
            <>
              <p className="text-xs text-dark-500 dark:text-dark-400">
                Expected columns (row 1 = header):{' '}
                <span className="font-medium text-dark-600 dark:text-dark-300">
                  Name, Category, Unit, Unit Cost, Vendor
                </span>
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line bg-primary-50/60 px-5 py-3 text-sm text-dark-600 hover:bg-primary-50 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-dark-300 dark:hover:bg-white/[0.06]">
                {isParsing ? 'Parsing…' : 'Choose .xlsx / .xls file'}
                <input
                  ref={excelRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={isParsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile('/materials/bulk-preview', f, excelRef);
                  }}
                />
              </label>
              {previewErrors.length > 0 && (
                <ul className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {previewErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {(previewRows.length > 0 || isParsing) && (
                <PreviewTable rows={previewRows} onChange={setPreviewRows} />
              )}
            </>
          )}

          {/* AI Extract tab */}
          {tab === 'ai' && (
            <>
              <p className="text-xs text-dark-500 dark:text-dark-400">
                Upload a photo or screenshot of a rate chart — AI will extract
                the materials table. Review and edit before saving.
              </p>
              <ModelTierPicker
                tier={tier}
                onChange={setTier}
                options={modelOptions}
                disabled={isParsing}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line bg-primary-50/60 px-5 py-3 text-sm text-dark-600 hover:bg-primary-50 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-dark-300 dark:hover:bg-white/[0.06]">
                {isParsing ? 'Extracting…' : 'Choose image'}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isParsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      uploadFile('/materials/ai-extract', f, imageRef, tier);
                  }}
                />
              </label>
              {previewErrors.length > 0 && (
                <ul className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {previewErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {(previewRows.length > 0 || isParsing) && (
                <PreviewTable rows={previewRows} onChange={setPreviewRows} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex justify-end gap-3 border-t border-line px-4 py-4 dark:border-primary-300/15 sm:px-6 max-sm:[&>*]:flex-1">
          <button onClick={onClose} className={btnGhost} disabled={isSaving}>
            Cancel
          </button>
          {tab === 'manual' ? (
            <button
              onClick={addManual}
              disabled={
                !manualForm.name ||
                !manualForm.category ||
                !manualForm.unit_cost ||
                isSaving
              }
              className={btnPrimary}
            >
              {isSaving ? 'Adding…' : 'Add Material'}
            </button>
          ) : (
            <button
              onClick={confirmBulk}
              disabled={previewRows.length === 0 || isSaving}
              className={btnPrimary}
            >
              {isSaving
                ? 'Saving…'
                : `Save ${previewRows.length} row${previewRows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({
  material,
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: material.name,
    category: material.category,
    unit: material.unit,
    unit_cost: String(material.unit_cost),
    vendor: material.vendor ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const setF =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setIsSaving(true);
    try {
      await api.put(`/materials/${material.id}`, {
        ...form,
        unit_cost: parseFloat(form.unit_cost),
        vendor: form.vendor || null,
      });
      toast.success('Material updated');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to update material');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark-950/60 backdrop-blur-md sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] dark:border-primary-300/15 dark:bg-dark-800 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold tracking-tight text-dark-900 dark:text-white">
            Edit Material
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2.5 text-dark-500 hover:bg-primary-50 dark:text-dark-400 dark:hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Name', key: 'name' as const },
            { label: 'Category', key: 'category' as const },
            { label: 'Unit', key: 'unit' as const },
            { label: 'Unit Cost (₹)', key: 'unit_cost' as const },
            { label: 'Vendor', key: 'vendor' as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                value={form[key]}
                onChange={setF(key)}
                className={INPUT_CLS}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3 max-sm:[&>*]:flex-1">
          <button onClick={onClose} className={btnGhost} disabled={isSaving}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!form.name || !form.unit_cost || isSaving}
            className={btnPrimary}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MaterialsPage() {
  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [search, setSearch] = useState('');

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => api.get<Material[]>('/materials'),
  });

  const { data: margins = [] } = useQuery<MarginConfig[]>({
    queryKey: ['margins'],
    queryFn: () => api.get<MarginConfig[]>('/margins'),
  });

  const upsertMargin = useMutation({
    mutationFn: ({
      category,
      margin_percent,
    }: {
      category: string | null;
      margin_percent: number;
    }) => api.put('/margins', { category, margin_percent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['margins'] });
      toast.success('Margin updated');
    },
    onError: () => toast.error('Failed to update margin'),
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: string) => api.delete(`/materials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete'),
  });

  const q = search.toLowerCase();
  const filtered = materials.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      (m.vendor ?? '').toLowerCase().includes(q) ||
      String(m.unit_cost).includes(q) ||
      m.unit.toLowerCase().includes(q)
  );

  const invalidateMaterials = () =>
    qc.invalidateQueries({ queryKey: ['materials'] });

  if (isLoading) {
    return (
      <LoadingRegion label="Loading materials" className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <ListSkeleton rows={6} rowClassName="h-14" className="space-y-2" />
      </LoadingRegion>
    );
  }

  return (
    <div className="space-y-6">
      {/* Margins */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-dark-500 dark:text-dark-400">
          Margin Configuration
        </h2>
        <div className="surface p-4">
          <div className="space-y-2">
            {margins.map((m) => (
              <div key={m.id} className="flex items-center gap-4">
                <span className="w-32 shrink-0 text-sm font-medium text-dark-700 dark:text-dark-300 sm:w-36">
                  {m.category ?? 'Global (default)'}
                </span>
                <input
                  type="number"
                  defaultValue={m.margin_percent}
                  onBlur={(e) =>
                    upsertMargin.mutate({
                      category: m.category,
                      margin_percent: parseFloat(e.target.value),
                    })
                  }
                  className="field !w-24 !py-1.5"
                />
                <span className="text-sm text-dark-500 dark:text-dark-400">
                  %
                </span>
              </div>
            ))}
            {margins.length === 0 && (
              <p className="text-sm text-dark-500 dark:text-dark-400">
                No margin config. Global default is 15%.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Materials table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-dark-500 dark:text-dark-400">
            Materials Rates Table
          </h2>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            {/* Search — full width on mobile */}
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 dark:text-dark-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials…"
                className="field !py-2 !pl-9 sm:!w-64"
              />
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="btn-primary shrink-0 whitespace-nowrap"
            >
              + Add Material
            </button>
          </div>
        </div>

        <ul className="space-y-3 md:hidden">
          {filtered.map((m) => (
            <li key={m.id} className="surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-bold text-dark-900 dark:text-white">
                    {m.name}
                  </p>
                  <span className="badge mt-1 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                    {m.category}
                  </span>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => setEditTarget(m)}
                    className="rounded-full p-3 text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10"
                    aria-label={`Edit ${m.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="rounded-full p-3 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <dt className="field-label">Cost</dt>
                  <dd className="text-sm font-extrabold tabular-nums text-dark-900 dark:text-white">
                    {fmtRate(m.unit_cost)}
                  </dd>
                </div>
                <div>
                  <dt className="field-label">Unit</dt>
                  <dd className="text-sm text-dark-700 dark:text-dark-300">
                    {m.unit}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="field-label">Vendor</dt>
                  <dd className="truncate text-sm text-dark-700 dark:text-dark-300">
                    {m.vendor ?? '—'}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="surface p-8 text-center text-sm text-dark-500 dark:text-dark-400">
              {search
                ? `No materials match "${search}".`
                : 'No materials yet. Tap + Add Material to get started.'}
            </li>
          )}
        </ul>

        <div className="surface hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  'Name',
                  'Category',
                  'Unit',
                  'Cost',
                  'Vendor',
                  'Updated',
                  '',
                ].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-primary-50/70 dark:hover:bg-white/[0.06]"
                >
                  <td className="font-medium text-dark-900 dark:text-white">
                    {m.name}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">
                    {m.category}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">{m.unit}</td>
                  <td className="font-medium tabular-nums text-dark-900 dark:text-white">
                    {fmtRate(m.unit_cost)}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">
                    {m.vendor ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-xs text-dark-500 dark:text-dark-400">
                    {new Date(m.updated_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTarget(m)}
                        className="rounded-full p-2 text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10 dark:hover:text-primary-400"
                        aria-label={`Edit ${m.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="rounded-full p-2 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        aria-label={`Delete ${m.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="!py-12 text-center text-dark-500 dark:text-dark-400"
                  >
                    {search
                      ? `No materials match "${search}".`
                      : 'No materials yet. Click + Add Material to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSaved={invalidateMaterials}
        />
      )}

      {editTarget && (
        <EditModal
          material={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={invalidateMaterials}
        />
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        isLoading={deleteMaterial.isPending}
        title="Delete Material"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMaterial.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

'use client';

import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ModelTierPicker } from '@/components/shared/ModelTierPicker';
import { type ModelTier, useModelTier } from '@/lib/aiModels';
import { api } from '@/lib/api';
import {
  type DraftRow,
  type Material,
  isRowValid,
  parseCost,
} from '@/lib/materials';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { ServerRow } from '@/components/materials/types';
import {
  MANUAL_EMPTY,
  MaterialFields,
  TAB_LABELS,
  Tab,
} from '@/components/materials/MaterialFields';
import { PreviewTable } from '@/components/materials/PreviewTable';

// ── Import modal ─────────────────────────────────────────────────────────────
export function ImportModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>('manual');
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [previewRows, setPreviewRows] = useState<DraftRow[]>([]);
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

  const switchTab = (t: Tab) => {
    setTab(t);
    setPendingTab(null);
    resetPreview();
  };

  const handleTabChange = (t: Tab) => {
    if (t === tab) return;
    // Switching drops the preview, so ask before throwing rows away.
    if (previewRows.length > 0) setPendingTab(t);
    else switchTab(t);
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
      const res = await api.postForm<{ rows: ServerRow[]; errors: string[] }>(
        endpoint,
        fd
      );
      setPreviewRows(
        res.rows.map((r) => ({ ...r, unit_cost: String(r.unit_cost) }))
      );
      setPreviewErrors(res.errors);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Upload failed'));
    } finally {
      setIsParsing(false);
      if (ref.current) ref.current.value = '';
    }
  };

  const invalidCount = previewRows.filter((r) => !isRowValid(r)).length;

  const confirmBulk = async () => {
    if (invalidCount > 0) return;
    setIsSaving(true);
    try {
      await api.post('/materials/bulk-confirm', {
        rows: previewRows.map((r) => ({
          ...r,
          unit_cost: parseCost(r.unit_cost) ?? 0,
        })),
        errors: [],
      });
      toast.success(`${previewRows.length} materials saved`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to save materials'));
    } finally {
      setIsSaving(false);
    }
  };

  const manualCost = parseCost(manualForm.unit_cost);

  const addManual = async () => {
    if (manualCost === null) return;
    setIsSaving(true);
    try {
      await api.post('/materials', {
        ...manualForm,
        unit_cost: manualCost,
        vendor: manualForm.vendor || null,
      });
      toast.success('Material added');
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to add material'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add Materials" maxWidth="xl">
      <div className="space-y-4">
        <div role="tablist" aria-label="How to add materials" className="seg">
          {TAB_LABELS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => handleTabChange(t.key)}
              className="seg-btn"
            >
              {t.label}
            </button>
          ))}
        </div>

        {pendingTab && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <span className="mr-auto">
              Switching discards the {previewRows.length} row
              {previewRows.length === 1 ? '' : 's'} you are reviewing.
            </span>
            <button
              type="button"
              onClick={() => setPendingTab(null)}
              className="btn-secondary"
            >
              Keep reviewing
            </button>
            <button
              type="button"
              onClick={() => switchTab(pendingTab)}
              className="btn-primary"
            >
              Discard and switch
            </button>
          </div>
        )}

        {tab === 'manual' && (
          <>
            <MaterialFields
              form={manualForm}
              required
              onChange={(k, v) => setManualForm((p) => ({ ...p, [k]: v }))}
            />
            <ModalFooter
              onCancel={onClose}
              onConfirm={addManual}
              confirmLabel="Add Material"
              loading={isSaving}
              loadingLabel="Adding…"
              disabled={
                !manualForm.name.trim() ||
                !manualForm.category.trim() ||
                manualCost === null
              }
            />
          </>
        )}

        {tab === 'excel' && (
          <>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              Expected columns (row 1 = header):{' '}
              <span className="font-medium text-dark-600 dark:text-dark-300">
                Name, Category, Unit, Unit Cost, Vendor
              </span>
            </p>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line bg-primary-50/60 px-5 py-3 text-sm text-dark-600 hover:bg-primary-50 dark:border-line dark:bg-dark-900/60 dark:text-dark-300 dark:hover:bg-white/[0.06]">
              {isParsing ? 'Parsing…' : 'Choose .xlsx / .xls file'}
              <input
                ref={excelRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                disabled={isParsing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile('/materials/bulk-preview', f, excelRef);
                }}
              />
            </label>
          </>
        )}

        {tab === 'ai' && (
          <>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              Upload a photo or screenshot of a rate chart — AI will extract the
              materials table. Review and edit before saving.
            </p>
            <ModelTierPicker
              tier={tier}
              onChange={setTier}
              options={modelOptions}
              disabled={isParsing}
            />
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line bg-primary-50/60 px-5 py-3 text-sm text-dark-600 hover:bg-primary-50 dark:border-line dark:bg-dark-900/60 dark:text-dark-300 dark:hover:bg-white/[0.06]">
              {isParsing ? 'Extracting…' : 'Choose image'}
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={isParsing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile('/materials/ai-extract', f, imageRef, tier);
                }}
              />
            </label>
          </>
        )}

        {tab !== 'manual' && (
          <>
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
            {invalidCount > 0 && (
              <p
                role="alert"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {invalidCount} row{invalidCount === 1 ? ' is' : 's are'} missing
                a name or a valid cost (highlighted). Fix or remove{' '}
                {invalidCount === 1 ? 'it' : 'them'} to save.
              </p>
            )}
            <ModalFooter
              onCancel={onClose}
              onConfirm={confirmBulk}
              confirmLabel={`Save ${previewRows.length} row${previewRows.length !== 1 ? 's' : ''}`}
              loading={isSaving}
              loadingLabel="Saving…"
              disabled={previewRows.length === 0 || invalidCount > 0}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

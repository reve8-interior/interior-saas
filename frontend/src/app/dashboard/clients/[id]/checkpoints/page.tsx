'use client';

import { ListSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useModelTier } from '@/lib/aiModels';
import { ExtractionProgress } from '@/components/shared/ExtractionProgress';
import { ModelTierPicker } from '@/components/shared/ModelTierPicker';
import {
  type ConfirmLineItem,
  type ExtractionRecord,
  type ExtractionResponse,
  type ItemAction,
  checkpointNumbers,
  compareCheckpoints,
  extractFromFile,
  extractFromText,
  saveFromExtraction,
  updateQuotationItems,
} from '@/lib/checkpoints';
import {
  type LineItemColumnDef,
  columnLabel,
  missingRequiredFields,
  useLineItemColumns,
} from '@/lib/lineItemColumns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Trash2, X } from 'lucide-react';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { INPUT_CLS } from '@/lib/constants';
import { fmtUsd } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { EmptyState } from '@/components/ui/EmptyState';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItemData {
  action: ItemAction;
  target_item_id: string | null;
  target_summary: string | null;
  room: string;
  description: string;
  unit: string;
  raw_dimension: string | null;
  qty: number | null;
  rate: number | null;
  est_time: string | null;
  remarks: string | null;
  extra?: Record<string, string | number | null>;
  verified: boolean;
}

interface Checkpoint {
  id: string;
  summary_text: string;
  structured_diff: Record<string, unknown>;
  raw_conversation: string | null;
  audio_transcript: string | null;
  status: string;
  source: string;
  added_to_quotation: boolean;
  created_at: string;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

// Matches the quotation table: 13px text, tight rows.
const cellInputCls = 'field !rounded-lg !px-2 !py-1 !text-[13px]';

const UNITS = ['sqft', 'rft', 'nos', 'sets', 'lump sum', 'dimension'];

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<ItemAction, { label: string; cls: string }> = {
  add: {
    label: 'New',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  update: {
    label: 'Update',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  remove: {
    label: 'Remove',
    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

/**
 * What this row does to the quotation. An update or removal names the
 * live item it targets, so the verifier can see what is about to change
 * rather than inferring it from a description.
 */
/** Persists edited rows; a failed save must be visible, not look saved. */
function saveExtractedItems(
  checkpointId: string,
  lineItems: LineItemData[]
): void {
  api
    .patch(`/checkpoints/${checkpointId}/extracted-items`, {
      line_items: lineItems,
    })
    .catch((err) =>
      // Fixed id so a burst of failed edits shows a single toast.
      toast.error(
        errorMessage(err, 'Changes were not saved — check your connection.'),
        { id: 'extracted-items-save-failed' }
      )
    );
}

function ActionBadge({
  action,
  targetSummary,
}: {
  action: ItemAction;
  targetSummary: string | null;
}) {
  const { label, cls } = ACTION_STYLES[action] ?? ACTION_STYLES.add;
  return (
    <span
      title={
        targetSummary
          ? `Currently on the quotation: ${targetSummary}`
          : 'Not on the quotation yet'
      }
      className={`badge ${cls}`}
    >
      {label}
    </span>
  );
}

/** Bulleted panel for agent notes and pipeline corrections. */
function NotePanel({
  title,
  notes,
  tone,
  collapsible = false,
}: {
  title: string;
  notes: string[];
  tone: 'amber' | 'slate';
  /** Fold the list behind its title so it doesn't compete with the rows. */
  collapsible?: boolean;
}) {
  if (notes.length === 0) return null;
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      : 'border-line bg-primary-50/60 text-dark-600 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-dark-300';
  if (collapsible) {
    return (
      <details className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
        <summary className="cursor-pointer font-medium">
          {title} ({notes.length})
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
    );
  }
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Shared dynamic line-item cell ─────────────────────────────────────────────

// Builtin string fields that must stay strings (never null)
const NON_NULLABLE_KEYS = new Set(['room', 'description', 'unit']);

function cellClass(col: LineItemColumnDef): string {
  if (col.key === 'description') return 'min-w-[240px]';
  if (col.key === 'remarks') return 'min-w-[180px]';
  if (col.type === 'number') return 'min-w-[96px]';
  if (col.key === 'raw_dimension' || col.key === 'est_time')
    return 'min-w-[120px]';
  return 'min-w-[120px]';
}

const STICKY = 'sticky z-10 bg-white dark:bg-dark-900';

function ItemCell({
  col,
  item,
  onChange,
}: {
  col: LineItemColumnDef;
  item: { extra?: Record<string, string | number | null> | null };
  onChange: (
    key: string,
    value: string | number | null,
    isCustom: boolean
  ) => void;
}) {
  const raw = col.builtin
    ? (item as unknown as Record<string, unknown>)[col.key]
    : (item.extra ?? {})[col.key];
  const value = raw == null ? '' : String(raw);
  const invalid = col.required && !value.trim();
  const cls = `${cellInputCls} ${invalid ? 'field-invalid' : ''}`;

  if (col.key === 'unit') {
    return (
      <select
        value={value || 'sqft'}
        onChange={(e) => onChange(col.key, e.target.value, false)}
        className={cls}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(
            col.key,
            e.target.value ? parseFloat(e.target.value) : null,
            !col.builtin
          )
        }
        className={cls}
      />
    );
  }
  const nullable = !NON_NULLABLE_KEYS.has(col.key);
  return (
    <input
      value={value}
      onChange={(e) =>
        onChange(
          col.key,
          nullable ? e.target.value || null : e.target.value,
          !col.builtin
        )
      }
      className={cls}
      placeholder={
        col.key === 'raw_dimension'
          ? 'e.g. 6x8'
          : col.key === 'est_time'
            ? 'e.g. 2 weeks'
            : col.required
              ? `${col.label} *`
              : undefined
      }
    />
  );
}

// ── Mobile item card ──────────────────────────────────────────────────────────

/** Fields that need the full card width on a phone. */
const WIDE_KEYS = new Set(['room', 'description', 'remarks']);

interface CardItem {
  action: ItemAction;
  target_summary: string | null;
  verified?: boolean;
  extra?: Record<string, string | number | null> | null;
}

/**
 * One line item as a stacked card (phones). The wide editable table stays for
 * desktop; here every field gets a label and a full-height touch target.
 */
function ItemCard({
  item,
  index,
  cols,
  allCols,
  onChange,
  onVerify,
  onRemove,
}: {
  item: CardItem;
  index: number;
  cols: LineItemColumnDef[];
  allCols: LineItemColumnDef[];
  onChange: (
    key: string,
    value: string | number | null,
    isCustom: boolean
  ) => void;
  onVerify?: (verified: boolean) => void;
  onRemove?: () => void;
}) {
  const missing =
    item.action !== 'remove' && missingRequiredFields(item, allCols).length > 0;
  const tone = missing
    ? 'border-red-300 bg-red-50/70 dark:border-red-400/30 dark:bg-red-500/10'
    : item.verified
      ? 'border-green-300/80 bg-green-50/60 dark:border-green-400/25 dark:bg-green-500/10'
      : 'border-line bg-white/70 dark:border-primary-300/15 dark:bg-white/[0.03]';
  return (
    <li className={`rounded-2xl border p-3.5 ${tone}`}>
      <div className="flex min-h-11 items-center gap-3">
        {onVerify && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-dark-800 dark:text-dark-100">
            <input
              type="checkbox"
              checked={Boolean(item.verified)}
              onChange={(e) => onVerify(e.target.checked)}
            />
            Verified
          </label>
        )}
        <ActionBadge action={item.action} targetSummary={item.target_summary} />
        <span className="ml-auto text-xs font-medium text-dark-500 dark:text-dark-400">
          Row {index + 1}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove row ${index + 1}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {cols.map((col) => (
          <label
            key={col.key}
            className={WIDE_KEYS.has(col.key) ? 'col-span-2' : ''}
          >
            <span className="field-label">{columnLabel(col)}</span>
            <ItemCell col={col} item={item} onChange={onChange} />
          </label>
        ))}
      </div>
    </li>
  );
}

// ── AI Extract Modal ──────────────────────────────────────────────────────────

type InputTab = 'paste' | 'text-file' | 'audio';
type ModalStep = 'input' | 'review';

function AiExtractModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: (quotationId: string | null) => void;
}) {
  const [step, setStep] = useState<ModalStep>('input');
  const [inputTab, setInputTab] = useState<InputTab>('paste');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [editedMinutes, setEditedMinutes] = useState('');
  const [editedItems, setEditedItems] = useState<ConfirmLineItem[]>([]);
  const [budget, setBudget] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { columns } = useLineItemColumns();
  const enabledCols = columns.filter((c) => c.enabled);
  const { options: modelOptions, tier, setTier } = useModelTier();

  async function handleExtract() {
    setIsExtracting(true);
    try {
      let result: ExtractionResponse;
      if (inputTab === 'paste') {
        if (!pastedText.trim()) {
          toast.error('Paste some text first');
          return;
        }
        result = await extractFromText(clientId, pastedText, tier);
      } else {
        if (!file) {
          toast.error('Select a file first');
          return;
        }
        result = await extractFromFile(clientId, file, tier);
      }
      const items = result.line_items.map((li) => ({
        ...li,
        catalog_type: 'core_works',
      }));
      const minutes = result.meeting_minutes.join('\n');
      const extractedBudget = result.client_budget
        ? String(result.client_budget)
        : '';
      setExtraction(result);
      setEditedMinutes(minutes);
      setEditedItems(items);
      if (extractedBudget) setBudget(extractedBudget);
      // Land straight in the conversation, where the rows are checked against
      // the source text. The review step is only the fallback if saving fails
      // (e.g. a mandatory column is empty) so the rows can be fixed here.
      const saved = await handleSave(result, minutes, items, extractedBudget);
      if (saved) return;
      setStep('review');
      if (result.line_items.length === 0) {
        toast.info(
          'No quotation line items found in this text — you can still ' +
            'save the minutes or add rows by hand.'
        );
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Extraction failed'));
    } finally {
      setIsExtracting(false);
    }
  }

  function updateItem(
    idx: number,
    field: keyof ConfirmLineItem,
    value: string | number | null
  ) {
    setEditedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  function updateItemExtra(
    idx: number,
    key: string,
    value: string | number | null
  ) {
    setEditedItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, extra: { ...(item.extra ?? {}), [key]: value } }
          : item
      )
    );
  }

  function removeItem(idx: number) {
    setEditedItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    setEditedItems((prev) => [
      ...prev,
      {
        action: 'add',
        target_item_id: null,
        target_summary: null,
        room: '',
        description: '',
        unit: 'sqft',
        raw_dimension: null,
        qty: null,
        rate: null,
        est_time: null,
        remarks: null,
        catalog_type: 'core_works',
        extra: {},
      },
    ]);
  }

  /** Saves the conversation; returns whether it succeeded. */
  async function handleSave(
    source: ExtractionResponse | null = extraction,
    minutes: string = editedMinutes,
    items: ConfirmLineItem[] = editedItems,
    budgetValue: string = budget
  ): Promise<boolean> {
    if (!source) return false;
    setIsSaving(true);
    try {
      const result = await saveFromExtraction(clientId, {
        audit_log_id: source.audit_log_id,
        summary_text: minutes,
        raw_transcript: source.transcript,
        audio_transcript: inputTab === 'audio' ? source.transcript : null,
        line_items: items,
        client_budget: budgetValue ? parseFloat(budgetValue) : null,
        unmapped_notes: source.unmapped_notes,
        tier,
        create_quotation: false,
      });
      onSaved(result.quotation_id);
      return true;
    } catch (err) {
      // Surface the reason — a mandatory-column rejection is fixable
      // right here, and a silent failure looked like a lost extraction.
      toast.error(errorMessage(err, 'Failed to save conversation'));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const tabBtn = (tab: InputTab, label: string) => (
    <button
      role="tab"
      aria-selected={inputTab === tab}
      onClick={() => setInputTab(tab)}
      className="seg-btn"
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-dark-950/60 backdrop-blur-md sm:items-center sm:p-4">
      <div className="flex h-dvh w-full max-w-5xl flex-col rounded-none border border-line bg-white shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] dark:border-primary-300/15 dark:bg-dark-800 sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-primary-300/15 sm:px-6 sm:py-4">
          <h2 className="text-lg font-extrabold tracking-tight text-dark-900 dark:text-white">
            AI Extract — New Conversation
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dark-500 hover:bg-primary-50 dark:text-dark-400 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" className="seg">
                  {tabBtn('paste', 'Paste text')}
                  {tabBtn('text-file', 'Text file')}
                  <button
                    role="tab"
                    disabled
                    aria-selected={false}
                    title="Voice extraction is coming soon"
                    className="seg-btn gap-2"
                  >
                    Audio file
                    <span className="badge bg-primary-100/70 !px-2 !py-0 text-[10px] uppercase tracking-wide text-dark-500 dark:bg-white/10 dark:text-dark-300">
                      Soon
                    </span>
                  </button>
                </div>
                <ModelTierPicker
                  compact
                  tier={tier}
                  onChange={setTier}
                  options={modelOptions}
                  disabled={isExtracting}
                />
              </div>
              {inputTab === 'paste' && (
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste meeting notes or conversation transcript..."
                  rows={12}
                  className={INPUT_CLS}
                />
              )}
              {inputTab === 'text-file' && (
                <div className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-dark-500 hover:border-primary-400 hover:text-primary-600 dark:border-primary-300/15 dark:text-dark-400"
                  >
                    {file ? file.name : 'Click to select .txt / .md file'}
                  </button>
                </div>
              )}
              {inputTab === 'audio' && (
                <div className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="audio/*,video/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-dark-500 hover:border-primary-400 hover:text-primary-600 dark:border-primary-300/15 dark:text-dark-400"
                  >
                    {file
                      ? file.name
                      : 'Click to select audio (.mp3, .wav, .m4a, .mp4)'}
                  </button>
                  <p className="text-xs text-dark-500 dark:text-dark-400">
                    Audio will be transcribed via Whisper before extraction.
                  </p>
                </div>
              )}
              {isExtracting && (
                <ExtractionProgress
                  chars={
                    inputTab === 'paste' ? pastedText.length : (file?.size ?? 0)
                  }
                />
              )}
            </div>
          )}

          {step === 'review' && extraction && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 rounded-xl bg-primary-50/60 px-4 py-3 text-xs text-dark-500 dark:bg-dark-900/60 dark:text-dark-400">
                <span>
                  Model: <strong>{extraction.model}</strong>
                </span>
                <span>
                  Cost:{' '}
                  <strong>
                    {extraction.cost_usd === null
                      ? '—'
                      : fmtUsd(extraction.cost_usd)}
                  </strong>
                </span>
                <span>
                  Speed:{' '}
                  <strong>{(extraction.latency_ms / 1000).toFixed(1)}s</strong>
                </span>
                {extraction.scope.total_items > 0 && (
                  <span
                    title={
                      extraction.scope.matched_rooms.length > 0
                        ? `Rooms recognised: ${extraction.scope.matched_rooms.join(', ')}`
                        : 'No existing room was recognised in this text'
                    }
                  >
                    Context:{' '}
                    <strong>
                      {extraction.scope.items_in_context}/
                      {extraction.scope.total_items}
                    </strong>{' '}
                    existing items
                  </span>
                )}
              </div>

              <NotePanel
                title="Not turned into line items — review these"
                notes={extraction.unmapped_notes}
                tone="amber"
              />
              <NotePanel
                title="Adjusted automatically before showing you these rows"
                notes={extraction.warnings}
                tone="slate"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-dark-900 dark:text-white">
                  Meeting Minutes
                </label>
                <textarea
                  value={editedMinutes}
                  onChange={(e) => setEditedMinutes(e.target.value)}
                  rows={6}
                  className={INPUT_CLS}
                  placeholder="One bullet per line..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-dark-900 dark:text-white">
                    Extracted line items ({editedItems.length})
                  </span>
                  <button onClick={addItem} className="link-action">
                    + Add row
                  </button>
                </div>
                {/* Phones: one card per row */}
                <ul className="space-y-3 md:hidden">
                  {editedItems.map((item, idx) => (
                    <ItemCard
                      key={idx}
                      item={item}
                      index={idx}
                      cols={enabledCols}
                      allCols={columns}
                      onRemove={() => removeItem(idx)}
                      onChange={(key, value, isCustom) =>
                        isCustom
                          ? updateItemExtra(idx, key, value)
                          : updateItem(idx, key as keyof ConfirmLineItem, value)
                      }
                    />
                  ))}
                  {editedItems.length === 0 && (
                    <li className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
                      No line items extracted. Save anyway to keep the minutes,
                      or tap <strong>Add row</strong>.
                    </li>
                  )}
                </ul>
                <div className="hidden overflow-x-auto rounded-2xl border border-line dark:border-primary-300/15 md:block">
                  <table className="data-table w-max [&_td]:!py-0.5">
                    <thead>
                      <tr>
                        {['Action', ...enabledCols.map(columnLabel), ''].map(
                          (h, i) => (
                            <th
                              key={i}
                              className={
                                i === 0
                                  ? `w-24 min-w-24`
                                  : enabledCols[i - 1]?.key === 'room'
                                    ? `${STICKY} left-0`
                                    : ''
                              }
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-primary-300/10">
                      {editedItems.map((item, idx) => {
                        const missing =
                          missingRequiredFields(item, columns).length > 0;
                        return (
                          <tr
                            key={idx}
                            className={
                              missing ? 'bg-red-50 dark:bg-red-900/10' : ''
                            }
                          >
                            <td className={`w-24 min-w-24 px-2 py-1`}>
                              <ActionBadge
                                action={item.action}
                                targetSummary={item.target_summary}
                              />
                            </td>
                            {enabledCols.map((col) => (
                              <td
                                key={col.key}
                                className={`px-2 py-1 ${cellClass(col)} ${col.key === 'room' ? `${STICKY} left-0` : ''}`}
                              >
                                <ItemCell
                                  col={col}
                                  item={item}
                                  onChange={(key, value, isCustom) =>
                                    isCustom
                                      ? updateItemExtra(idx, key, value)
                                      : updateItem(
                                          idx,
                                          key as keyof ConfirmLineItem,
                                          value
                                        )
                                  }
                                />
                              </td>
                            ))}
                            <td className="px-2 py-1">
                              <button
                                onClick={() => removeItem(idx)}
                                aria-label={`Remove row ${idx + 1}`}
                                className="rounded-full p-2 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {editedItems.length === 0 && (
                        <tr>
                          <td
                            colSpan={enabledCols.length + 2}
                            className="py-6 text-center text-dark-500 dark:text-dark-400"
                          >
                            No line items extracted. Save anyway to keep the
                            minutes, or use <strong>+ Add row</strong>.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {extraction.material_hints.length > 0 && (
                <details className="rounded-xl border border-line dark:border-primary-300/15">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark-700 dark:text-dark-300">
                    Rate Hints from Materials Catalogue (
                    {extraction.material_hints.length})
                  </summary>
                  <div className="overflow-x-auto px-4 pb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-dark-500 dark:text-dark-400">
                          <th className="py-1 text-left">Name</th>
                          <th className="py-1 text-left">Category</th>
                          <th className="py-1 text-left">Unit</th>
                          <th className="py-1 text-right">Rate (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-primary-300/10">
                        {extraction.material_hints.map((h, i) => (
                          <tr key={i}>
                            <td className="py-1">{h.name}</td>
                            <td className="py-1 text-dark-500 dark:text-dark-400">
                              {h.category}
                            </td>
                            <td className="py-1">{h.unit}</td>
                            <td className="py-1 text-right">
                              ₹{h.unit_cost.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3 dark:border-primary-300/15 sm:gap-4">
                <label className="text-sm text-dark-700 dark:text-dark-300">
                  Client Budget (₹)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Optional"
                  className="w-36 rounded-lg border border-line px-2 py-1 text-sm dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-primary-300/15 sm:px-6 sm:py-4">
          <button
            onClick={step === 'review' ? () => setStep('input') : onClose}
            className="btn-secondary"
          >
            {step === 'review' ? '← Back' : 'Cancel'}
          </button>
          {step === 'input' ? (
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="btn-primary"
            >
              {isExtracting ? 'Extracting…' : 'Extract →'}
            </button>
          ) : (
            <button
              onClick={() => handleSave()}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving…' : 'Save Conversation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Checkpoint card ───────────────────────────────────────────────────────────

function CheckpointCard({
  cp,
  number,
  clientId,
  addBlocked,
  onItemsVerified,
  onQuotationUpdated,
}: {
  cp: Checkpoint;
  /** Chronological number (#1 = oldest) shown in the card header. */
  number: number;
  clientId: string;
  /** An older checkpoint with items is still pending — adds must wait. */
  addBlocked: boolean;
  /** A newer checkpoint is still on the quotation — removal is LIFO. */
  onItemsVerified: (cpId: string, items: LineItemData[]) => void;
  onQuotationUpdated: () => void;
}) {
  // Finished conversations fold away so the open one is the only thing to do.
  const [open, setOpen] = useState(!cp.added_to_quotation);
  const [showRerun, setShowRerun] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'minutes' | 'extract' | 'transcript'
  >('extract');
  const { columns } = useLineItemColumns();
  const enabledCols = columns.filter((c) => c.enabled);
  const [items, setItems] = useState<LineItemData[]>(() => {
    const raw = cp.structured_diff?.line_items;
    if (Array.isArray(raw)) {
      return raw.map(
        (li: Record<string, unknown>) =>
          ({
            ...li,
            // Rows saved before the delta-aware agent carry no action;
            // they were all new work.
            action: (li.action as ItemAction | undefined) ?? 'add',
            target_item_id:
              (li.target_item_id as string | null | undefined) ?? null,
            target_summary:
              (li.target_summary as string | null | undefined) ?? null,
            // unit may be null if AI didn't extract it; default to sqft so the
            // select renders the actual stored value, not a silent mismatch
            unit: (li.unit as string | null | undefined) || 'sqft',
            est_time: (li.est_time as string | null | undefined) ?? null,
            verified: li.verified ?? false,
          }) as LineItemData
      );
    }
    return [];
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const { options: modelOptions, tier, setTier } = useModelTier();
  const [isSendingToQuotation, setIsSendingToQuotation] = useState(false);

  // Proof that extraction has already run. An empty item list means two
  // very different things — "nobody extracted yet" and "extraction ran
  // and this meeting changed no billable work" — and treating them the
  // same is what made the card ask for an extract that had already
  // happened, over and over.
  const extractionRecord = cp.structured_diff?.extraction as
    | ExtractionRecord
    | undefined;
  const [ranAt, setRanAt] = useState<string | null>(
    extractionRecord?.ran_at ?? null
  );
  const [unmappedNotes, setUnmappedNotes] = useState<string[]>(
    extractionRecord?.unmapped_notes ?? []
  );

  // Report items to parent whenever they change
  useEffect(() => {
    onItemsVerified(cp.id, items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Report initial items after mount and patch any null units to DB
  useEffect(() => {
    if (items.length === 0) return;
    onItemsVerified(cp.id, items);
    // If any item had a null unit that we defaulted, write it back so DB is clean
    const hadNullUnit = (
      cp.structured_diff?.line_items as Record<string, unknown>[] | undefined
    )?.some((li) => !li.unit);
    if (hadNullUnit) {
      api
        .patch(`/checkpoints/${cp.id}/extracted-items`, { line_items: items })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasItems = items.length > 0;
  // "Has been extracted" is about provenance, not row count. Legacy
  // checkpoints have no record, so a non-empty list still counts.
  const hasRun = Boolean(ranAt) || hasItems;
  const verifiedCount = items.filter((i) => i.verified).length;
  const allVerified = hasItems && verifiedCount === items.length;

  // Items missing mandatory columns (see lib/lineItemColumns.ts).
  // A removal names an existing item instead of describing one, so the
  // mandatory-column rules do not apply to it — mirrors the backend.
  const missingItems = items
    .map((li, idx) => ({
      idx,
      label:
        [li.room, li.description].filter(Boolean).join(' — ') ||
        `Row ${idx + 1}`,
      missing: li.action === 'remove' ? [] : missingRequiredFields(li, columns),
    }))
    .filter((x) => x.missing.length > 0);

  const extractChars = (cp.raw_conversation || cp.summary_text || '').length;

  async function runExtract() {
    const text = cp.raw_conversation || cp.summary_text;
    if (!text?.trim()) {
      toast.error('No raw text to extract from');
      return;
    }
    setIsExtracting(true);
    try {
      const result = await extractFromText(clientId, text, tier);
      const newItems: LineItemData[] = result.line_items.map((li) => ({
        ...li,
        unit: li.unit || 'sqft',
        verified: false,
      }));
      const record: ExtractionRecord = {
        ran_at: new Date().toISOString(),
        model: result.model,
        item_count: newItems.length,
        unmapped_notes: result.unmapped_notes,
      };
      await api.patch(`/checkpoints/${cp.id}/extracted-items`, {
        line_items: newItems,
        extraction: record,
      });
      setItems(newItems);
      setRanAt(record.ran_at);
      setUnmappedNotes(result.unmapped_notes);
      toast.success(
        newItems.length > 0
          ? `Extraction complete — ${newItems.length} item${newItems.length === 1 ? '' : 's'}`
          : 'Extraction complete — no quotation line items in this text'
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Extraction failed'));
    } finally {
      setIsExtracting(false);
    }
  }

  /** Add an empty row so a thin or empty extraction is not a dead end. */
  function addManualItem() {
    setItems((prev) => {
      const next: LineItemData[] = [
        ...prev,
        {
          action: 'add',
          target_item_id: null,
          target_summary: null,
          room: '',
          description: '',
          unit: 'sqft',
          raw_dimension: null,
          qty: null,
          rate: null,
          est_time: null,
          remarks: null,
          extra: {},
          verified: false,
        },
      ];
      saveExtractedItems(cp.id, next);
      return next;
    });
  }

  function updateItem(
    idx: number,
    field: keyof LineItemData,
    value: string | number | boolean | null
  ) {
    setItems((prev) => {
      const next = prev.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      );
      saveExtractedItems(cp.id, next);
      return next;
    });
  }

  function updateItemExtra(
    idx: number,
    key: string,
    value: string | number | null
  ) {
    setItems((prev) => {
      const next = prev.map((item, i) =>
        i === idx
          ? { ...item, extra: { ...(item.extra ?? {}), [key]: value } }
          : item
      );
      saveExtractedItems(cp.id, next);
      return next;
    });
  }

  function toggleVerifyAll() {
    // If all verified → unverify all; otherwise verify all
    const target = !allVerified;
    setItems((prev) => {
      const next = prev.map((item) => ({ ...item, verified: target }));
      saveExtractedItems(cp.id, next);
      return next;
    });
  }

  async function sendToQuotation() {
    if (missingItems.length > 0 || addBlocked) return;
    const verifiedItems = items.filter((i) => i.verified);
    if (verifiedItems.length === 0) {
      toast.error('Verify at least one item first');
      return;
    }
    setIsSendingToQuotation(true);
    try {
      const result = await updateQuotationItems(
        clientId,
        cp.id,
        verifiedItems.map((li) => ({
          action: li.action,
          target_item_id: li.target_item_id,
          target_summary: li.target_summary,
          room: li.room,
          description: li.description,
          unit: li.unit,
          raw_dimension: li.raw_dimension,
          qty: li.qty,
          rate: li.rate,
          est_time: li.est_time,
          remarks: li.remarks,
          catalog_type: 'core_works',
          extra: li.extra ?? {},
        }))
      );
      const msg =
        result.action === 'created' ? 'Quotation created' : 'Quotation updated';
      const counts = [
        `${result.items_added} added`,
        `${result.items_updated} updated`,
        ...(result.items_removed ? [`${result.items_removed} removed`] : []),
      ];
      toast.success(`${msg} — ${counts.join(', ')}`);
      onQuotationUpdated();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update quotation'));
    } finally {
      setIsSendingToQuotation(false);
    }
  }

  const rawText = cp.audio_transcript || cp.raw_conversation;
  const minutesBullets = cp.summary_text
    ? cp.summary_text
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
    : [];

  const TAB_LABELS: {
    key: 'minutes' | 'extract' | 'transcript';
    label: string;
  }[] = [
    {
      key: 'extract',
      label: `Rows${hasItems ? ` (${items.length})` : ''}`,
    },
    { key: 'minutes', label: 'Minutes' },
    ...(rawText ? [{ key: 'transcript' as const, label: 'Transcript' }] : []),
  ];

  return (
    <div className="surface">
      {/* Card header: one tap folds or unfolds the conversation */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-4 py-2 text-left ${
          open ? 'border-b border-line dark:border-primary-300/15' : ''
        }`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-dark-500 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="badge bg-primary-100/70 text-dark-700 dark:bg-white/10 dark:text-dark-200">
            Conversation #{number}
          </span>
          {cp.added_to_quotation ? (
            <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              ✓ In quotation
            </span>
          ) : (
            allVerified && (
              <span className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                All verified
              </span>
            )
          )}
        </span>
        <span className="text-xs text-dark-500 dark:text-dark-400">
          {cp.source} · {new Date(cp.created_at).toLocaleDateString()}
        </span>
      </button>

      {open && (
        <>
          {/* Tabs — scroll horizontally if they don't fit */}
          <div className="px-4 pt-3">
            <div role="tablist" className="seg">
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setActiveTab(key)}
                  className="seg-btn"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4">
            {/* Meeting Minutes tab */}
            {activeTab === 'minutes' && (
              <ul className="space-y-1.5 pt-2">
                {minutesBullets.length > 0 ? (
                  minutesBullets.map((line, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-dark-900 dark:text-white"
                    >
                      <span className="mt-0.5 select-none text-primary-500">
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  ))
                ) : (
                  <li className="pt-2 text-sm text-dark-500 dark:text-dark-400">
                    No meeting minutes recorded.
                  </li>
                )}
              </ul>
            )}

            {/* Raw Transcript tab */}
            {activeTab === 'transcript' && (
              <p className="whitespace-pre-wrap pt-2 text-xs text-dark-600 dark:text-dark-300">
                {rawText}
              </p>
            )}

            {/* AI Extract tab */}
            {activeTab === 'extract' && (
              <div className="space-y-3 pt-2">
                {!hasItems ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    {hasRun ? (
                      // Extraction ran and produced nothing. Saying so — and
                      // offering a manual row — is the difference between a
                      // result and an apparent dead end.
                      <>
                        <p className="text-sm text-dark-500 dark:text-dark-300">
                          AI extraction ran
                          {ranAt
                            ? ` on ${new Date(ranAt).toLocaleString()}`
                            : ''}{' '}
                          and found no quotation line items in this text.
                        </p>
                        {unmappedNotes.length > 0 && (
                          <div className="w-full text-left">
                            <NotePanel
                              title="What it did pick up"
                              notes={unmappedNotes}
                              tone="amber"
                            />
                          </div>
                        )}
                        <div className="w-full text-left">
                          <ModelTierPicker
                            tier={tier}
                            onChange={setTier}
                            options={modelOptions}
                            disabled={isExtracting}
                          />
                        </div>
                        {isExtracting && (
                          <div className="w-full text-left">
                            <ExtractionProgress chars={extractChars} />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            onClick={addManualItem}
                            className="btn-primary"
                          >
                            + Add a line item
                          </button>
                          <button
                            onClick={runExtract}
                            disabled={isExtracting}
                            className="rounded-full border border-line px-4 py-2 text-sm text-dark-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-50 dark:border-primary-300/15 dark:text-dark-300"
                          >
                            {isExtracting
                              ? 'Re-extracting…'
                              : 'Re-run extraction'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-dark-500 dark:text-dark-400">
                          No AI extraction yet for this conversation.
                        </p>
                        <div className="w-full text-left">
                          <ModelTierPicker
                            tier={tier}
                            onChange={setTier}
                            options={modelOptions}
                            disabled={isExtracting}
                          />
                        </div>
                        {isExtracting && (
                          <div className="w-full text-left">
                            <ExtractionProgress chars={extractChars} />
                          </div>
                        )}
                        <button
                          onClick={runExtract}
                          disabled={isExtracting}
                          className="btn-primary"
                        >
                          {isExtracting ? 'Extracting…' : 'Run AI Extract'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Missing fields warning — shows exactly which rows and what's missing */}
                    {missingItems.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-800 dark:bg-red-900/20">
                        <p className="mb-1 font-medium text-red-700 dark:text-red-400">
                          {missingItems.length} item
                          {missingItems.length > 1 ? 's' : ''} need attention
                          before adding to quotation:
                        </p>
                        <ul className="space-y-0.5">
                          {missingItems.map(({ idx, label, missing }) => (
                            <li
                              key={idx}
                              className="text-red-600 dark:text-red-400"
                            >
                              Row {idx + 1} —{' '}
                              <span className="font-medium">{label}</span>:
                              missing {missing.join(', ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <NotePanel
                      title="Discussed but not turned into line items"
                      notes={unmappedNotes}
                      tone="amber"
                      collapsible
                    />

                    {cp.added_to_quotation && (
                      <p className="text-xs text-dark-500 dark:text-dark-400">
                        These rows are in the quotation. To change them, edit
                        the quotation and save a version.
                      </p>
                    )}

                    {!cp.added_to_quotation && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-dark-500">
                          {verifiedCount}/{items.length} verified
                        </span>
                        <button
                          onClick={toggleVerifyAll}
                          className="link-action"
                        >
                          {allVerified ? 'Unverify all' : 'Verify all'}
                        </button>
                      </div>
                    )}

                    {/* Phones: one card per row */}
                    <ul
                      className={`space-y-3 md:hidden ${cp.added_to_quotation ? 'pointer-events-none select-none opacity-60' : ''}`}
                    >
                      {items.map((item, idx) => (
                        <ItemCard
                          key={idx}
                          item={item}
                          index={idx}
                          cols={enabledCols}
                          allCols={columns}
                          onVerify={(v) => updateItem(idx, 'verified', v)}
                          onChange={(key, value, isCustom) =>
                            isCustom
                              ? updateItemExtra(idx, key, value)
                              : updateItem(
                                  idx,
                                  key as keyof LineItemData,
                                  value
                                )
                          }
                        />
                      ))}
                    </ul>
                    {/* A disabled fieldset locks the inputs but still scrolls sideways. */}
                    <fieldset
                      disabled={cp.added_to_quotation}
                      className="hidden min-w-0 md:block"
                    >
                      <div
                        className={`overflow-x-auto rounded-2xl border border-line dark:border-primary-300/15 ${cp.added_to_quotation ? 'opacity-60' : ''}`}
                      >
                        <table className="data-table w-max [&_td]:!py-0.5">
                          <thead>
                            <tr>
                              {[
                                'Verified',
                                'Action',
                                ...enabledCols.map(columnLabel),
                              ].map((h, i) => (
                                <th
                                  key={i}
                                  className={
                                    i === 0
                                      ? `w-16 min-w-16`
                                      : i === 1
                                        ? `w-24 min-w-24`
                                        : enabledCols[i - 2]?.key === 'room'
                                          ? `${STICKY} left-0`
                                          : ''
                                  }
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line dark:divide-primary-300/10">
                            {items.map((item, idx) => {
                              const rowMissing =
                                item.action !== 'remove' &&
                                missingRequiredFields(item, columns).length > 0;
                              return (
                                <tr
                                  key={idx}
                                  className={
                                    rowMissing
                                      ? 'bg-red-50/70 dark:bg-red-900/10'
                                      : item.verified
                                        ? 'bg-green-50/50 dark:bg-green-900/10'
                                        : ''
                                  }
                                >
                                  <td
                                    className={`w-16 min-w-16 px-2 py-1 text-center`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={item.verified}
                                      onChange={(e) =>
                                        updateItem(
                                          idx,
                                          'verified',
                                          e.target.checked
                                        )
                                      }
                                      aria-label={`Verify row ${idx + 1}`}
                                    />
                                  </td>
                                  <td className={`w-24 min-w-24 px-2 py-1`}>
                                    <ActionBadge
                                      action={item.action}
                                      targetSummary={item.target_summary}
                                    />
                                  </td>
                                  {enabledCols.map((col) => (
                                    <td
                                      key={col.key}
                                      className={`px-2 py-1 ${cellClass(col)} ${col.key === 'room' ? `${STICKY} left-0` : ''}`}
                                    >
                                      <ItemCell
                                        col={col}
                                        item={item}
                                        onChange={(key, value, isCustom) =>
                                          isCustom
                                            ? updateItemExtra(idx, key, value)
                                            : updateItem(
                                                idx,
                                                key as keyof LineItemData,
                                                value
                                              )
                                        }
                                      />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </fieldset>

                    {showRerun && !cp.added_to_quotation && (
                      <div className="space-y-2 rounded-xl border border-line p-3 dark:border-primary-300/15">
                        <ModelTierPicker
                          tier={tier}
                          onChange={setTier}
                          options={modelOptions}
                          disabled={isExtracting}
                        />
                        <button
                          onClick={runExtract}
                          disabled={isExtracting}
                          className="btn-secondary"
                        >
                          {isExtracting
                            ? 'Re-extracting…'
                            : 'Run extraction again'}
                        </button>
                      </div>
                    )}

                    {isExtracting && (
                      <ExtractionProgress chars={extractChars} />
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {!cp.added_to_quotation && (
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={addManualItem}
                            className="link-action"
                          >
                            + Add row
                          </button>
                          <button
                            onClick={() => setShowRerun((v) => !v)}
                            aria-expanded={showRerun}
                            className="link-action-muted"
                          >
                            Re-run extraction
                          </button>
                        </div>
                      )}
                      <div className="ml-auto">
                        {!cp.added_to_quotation && (
                          <button
                            onClick={sendToQuotation}
                            disabled={
                              isSendingToQuotation ||
                              verifiedCount === 0 ||
                              missingItems.length > 0 ||
                              addBlocked
                            }
                            title={
                              addBlocked
                                ? 'Add older conversations to the quotation first (old → new)'
                                : missingItems.length > 0
                                  ? 'Fix missing fields first'
                                  : verifiedCount === 0
                                    ? 'Verify at least one item'
                                    : ''
                            }
                            className="btn-primary"
                          >
                            {isSendingToQuotation
                              ? 'Updating…'
                              : addBlocked
                                ? 'Waiting on older conversation'
                                : `Add to Quotation (${verifiedCount})`}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckpointsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showAiModal, setShowAiModal] = useState(false);

  const { data: checkpoints = [], isLoading } = useQuery<Checkpoint[]>({
    queryKey: ['checkpoints', id],
    queryFn: () => api.get<Checkpoint[]>(`/clients/${id}/checkpoints`),
  });

  // Newest first; ordering is microsecond-safe (ISO string compare with
  // id tiebreak) and matches the backend's (created_at, id) ordering.
  const sorted = [...checkpoints].sort((a, b) => compareCheckpoints(b, a));

  // Chronological numbering: #1 = oldest checkpoint.
  const numbers = checkpointNumbers(checkpoints);

  // Quotation additions must go old → new: a checkpoint is blocked while
  // any OLDER checkpoint is still pending. A pending checkpoint blocks
  // when it has extracted items; legacy ai_extract checkpoints without
  // stored items also block (items unknown until re-extracted).
  const blocksAddition = (cp: Checkpoint) => {
    const diff = cp.structured_diff ?? {};
    if ('line_items' in diff) {
      return Array.isArray(diff.line_items) && diff.line_items.length > 0;
    }
    // Extraction ran and produced nothing: there is nothing to add, so
    // this checkpoint must not hold up the ones after it.
    if ('extraction' in diff) return false;
    return cp.source === 'ai_extract';
  };

  const isAddBlocked = (cp: Checkpoint) =>
    checkpoints.some(
      (other) =>
        other.id !== cp.id &&
        !other.added_to_quotation &&
        blocksAddition(other) &&
        compareCheckpoints(other, cp) < 0
    );

  function handleAiSaved(_quotationId: string | null) {
    qc.invalidateQueries({ queryKey: ['checkpoints', id] });
    setShowAiModal(false);
    toast.success(
      'Conversation saved — check the rows against the notes, tick the correct ones, then add them to the quotation'
    );
  }

  function handleQuotationUpdated() {
    qc.invalidateQueries({ queryKey: ['checkpoints', id] });
    qc.invalidateQueries({ queryKey: ['quotation', id] });
  }

  function handleItemsVerified(_cpId: string, _items: LineItemData[]) {
    // kept for future cross-checkpoint logic
  }

  return (
    <div className="space-y-6">
      <TopBarActions>
        <button onClick={() => setShowAiModal(true)} className="btn-primary">
          + AI Extract
        </button>
      </TopBarActions>

      {showAiModal && (
        <AiExtractModal
          clientId={id}
          onClose={() => setShowAiModal(false)}
          onSaved={handleAiSaved}
        />
      )}

      {isLoading ? (
        <ListSkeleton rows={3} rowClassName="h-24" />
      ) : sorted.length === 0 ? (
        <EmptyState>
          No conversations yet. Click <strong>+ AI Extract</strong> to upload or
          paste meeting notes.
        </EmptyState>
      ) : (
        <div className="relative space-y-4 md:ml-4 md:border-l-2 md:border-line md:dark:border-primary-300/15">
          {sorted.map((cp) => (
            <div key={cp.id} className="relative md:pl-6">
              <div
                aria-hidden
                className={`absolute -left-[7px] top-5 hidden h-3 w-3 rounded-full border-2 md:block ${
                  cp.added_to_quotation
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-line bg-white dark:border-primary-300/15 dark:bg-dark-900/60'
                }`}
              />
              <CheckpointCard
                cp={cp}
                number={numbers[cp.id] ?? 0}
                clientId={id}
                addBlocked={isAddBlocked(cp)}
                onItemsVerified={handleItemsVerified}
                onQuotationUpdated={handleQuotationUpdated}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

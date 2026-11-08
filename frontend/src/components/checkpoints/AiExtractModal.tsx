'use client';

import {
  blankItem,
  insertAt,
  removeAt,
  setActionAt,
  toQuotationPayload,
  updateExtraAt,
  updateItemAt,
} from '@/lib/checkpointItems';
import { ExtractReview } from './ExtractReview';
import { ExtractionProgress } from '@/components/shared/ExtractionProgress';
import {
  type ConfirmLineItem,
  type ExtractionResponse,
  type ItemAction,
  extractFromFile,
  extractFromText,
  saveFromExtraction,
} from '@/lib/checkpoints';
import { useLineItemColumns } from '@/lib/lineItemColumns';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { INPUT_CLS, MAX_EXTRACT_CHARS } from '@/lib/constants';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { errorMessage } from '@/lib/errors';
import { Modal } from '@/components/ui/Modal';

// ── AI Extract Modal ──────────────────────────────────────────────────────────

type InputTab = 'paste' | 'text-file' | 'audio';
type ModalStep = 'input' | 'review';

export function AiExtractModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: (checkpointId: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
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
  const tooLong = inputTab === 'paste' && pastedText.length > MAX_EXTRACT_CHARS;
  const fileRef = useRef<HTMLInputElement>(null);
  const { columns } = useLineItemColumns();
  const enabledCols = columns.filter((c) => c.enabled);

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExtracting && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isExtracting, isSaving]);

  async function handleExtract() {
    setIsExtracting(true);
    try {
      let result: ExtractionResponse;
      if (inputTab === 'paste') {
        if (!pastedText.trim()) {
          toast.error('Paste some text first');
          return;
        }
        result = await extractFromText(clientId, pastedText);
      } else {
        if (!file) {
          toast.error('Select a file first');
          return;
        }
        result = await extractFromFile(clientId, file);
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
      // Land straight in the meeting, where the rows are checked against
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
    setEditedItems((prev) => updateItemAt(prev, idx, field, value));
  }

  function changeAction(idx: number, action: ItemAction) {
    setEditedItems((prev) => setActionAt(prev, idx, action));
  }

  function updateItemExtra(
    idx: number,
    key: string,
    value: string | number | null
  ) {
    setEditedItems((prev) => updateExtraAt(prev, idx, key, value));
  }

  /** Removes a row and offers Undo, which restores it at the same position. */
  function removeItem(idx: number) {
    const removed = editedItems[idx];
    if (!removed) return;
    setEditedItems((prev) => removeAt(prev, idx));
    toast(`Row ${idx + 1} removed`, {
      action: {
        label: 'Undo',
        onClick: () => setEditedItems((prev) => insertAt(prev, idx, removed)),
      },
    });
  }

  function addItem() {
    setEditedItems((prev) => [...prev, ...toQuotationPayload([blankItem()])]);
  }

  /** Saves the notes; returns whether it succeeded. */
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
        summary_text: minutes,
        raw_transcript: source.transcript,
        audio_transcript: inputTab === 'audio' ? source.transcript : null,
        line_items: items,
        client_budget: budgetValue ? parseFloat(budgetValue) : null,
        unmapped_notes: source.unmapped_notes,
        questions: source.questions,
        audit_log_id: source.audit_log_id,
        create_quotation: false,
      });
      setPastedText('');
      onSaved(result.checkpoint_id);
      return true;
    } catch (err) {
      // Surface the reason — a mandatory-column rejection is fixable
      // right here, and a silent failure looked like a lost extraction.
      toast.error(errorMessage(err, 'Failed to save the notes'));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const tabBtn = (tab: InputTab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`input-tab-${tab}`}
      aria-selected={inputTab === tab}
      aria-controls="input-tabpanel"
      onClick={() => setInputTab(tab)}
      className="seg-btn"
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-dark-950/60 backdrop-blur-md sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-notes-title"
        className="flex h-dvh w-full max-w-5xl flex-col rounded-none border border-line bg-white shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] dark:border-line dark:bg-dark-800 sm:h-auto sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-line sm:px-6 sm:py-4">
          <h2
            id="add-notes-title"
            className="text-lg font-extrabold tracking-tight text-dark-900 dark:text-white"
          >
            Add meeting notes
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="icon-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 'input' && (
            <div
              role="tabpanel"
              id="input-tabpanel"
              aria-labelledby={`input-tab-${inputTab}`}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label="Notes source" className="seg">
                  {tabBtn('paste', 'Paste text')}
                  {tabBtn('text-file', 'Text file')}
                  <button
                    type="button"
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
              </div>
              {inputTab === 'paste' && (
                <textarea
                  value={pastedText}
                  aria-label="Meeting notes text"
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste meeting notes or a chat transcript..."
                  rows={12}
                  aria-describedby="extract-count"
                  className={INPUT_CLS}
                />
              )}
              {inputTab === 'paste' && (
                <p
                  id="extract-count"
                  aria-live="polite"
                  className={`text-xs tabular-nums ${
                    tooLong
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'text-dark-500 dark:text-dark-400'
                  }`}
                >
                  {tooLong
                    ? `${pastedText.length.toLocaleString()} characters. Over the limit by ${(pastedText.length - MAX_EXTRACT_CHARS).toLocaleString()}: add the notes in smaller parts.`
                    : `${pastedText.length.toLocaleString()} / ${MAX_EXTRACT_CHARS.toLocaleString()} characters`}
                </p>
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
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-dark-500 hover:border-primary-400 hover:text-primary-600 dark:border-line dark:text-dark-400"
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
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-dark-500 hover:border-primary-400 hover:text-primary-600 dark:border-line dark:text-dark-400"
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
            <ExtractReview
              extraction={extraction}
              minutes={editedMinutes}
              items={editedItems}
              budget={budget}
              columns={columns}
              onMinutesChange={setEditedMinutes}
              onBudgetChange={setBudget}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onChangeAction={changeAction}
              onUpdateItem={updateItem}
              onUpdateItemExtra={updateItemExtra}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-line sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={step === 'review' ? () => setStep('input') : onClose}
            className="btn-secondary"
          >
            {step === 'review' ? '← Back' : 'Cancel'}
          </button>
          {step === 'input' ? (
            <button
              type="button"
              onClick={handleExtract}
              disabled={
                isExtracting ||
                tooLong ||
                (inputTab === 'paste' ? !pastedText.trim() : !file)
              }
              className="btn-primary"
            >
              {isExtracting ? 'Extracting…' : 'Extract →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving…' : 'Save notes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

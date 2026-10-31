'use client';

import { NoItemsPanel } from './NoItemsPanel';
import { ItemsGrid } from './ItemsGrid';
import { api } from '@/lib/api';
import { useModelTier } from '@/lib/aiModels';
import { ExtractionProgress } from '@/components/shared/ExtractionProgress';
import { ModelTierPicker } from '@/components/shared/ModelTierPicker';
import {
  type ExtractionQuestion,
  type ExtractionRecord,
  deleteCheckpoint,
  extractFromText,
  updateCheckpointNotes,
  updateQuotationItems,
} from '@/lib/checkpoints';
import { MAX_EXTRACT_CHARS } from '@/lib/constants';
import { useLineItemColumns } from '@/lib/lineItemColumns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addDisabledReason as addDisabledReasonFor,
  blankItem,
  findMissingItems,
  minutesBullets,
  parseStoredItems,
  setAllVerified,
  summarizeVerified,
  toQuotationPayload,
  updateExtraAt,
  updateItemAt,
} from '@/lib/checkpointItems';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { MeetingQuestions } from './MeetingQuestions';
import { Checkpoint, LineItemData } from './types';
import { NotePanel, saveExtractedItems } from './ItemEditor';

// ── Checkpoint card ───────────────────────────────────────────────────────────

export function CheckpointCard({
  cp,
  number,
  clientId,
  onQuotationUpdated,
}: {
  cp: Checkpoint;
  /** Written-order number (#1 = first) shown in the card header. */
  number: number;
  clientId: string;
  /** Refreshes the meetings and the quotation after a change. */
  onQuotationUpdated: () => void;
}) {
  // Finished meetings fold away so the open one is the only thing to do.
  const [open, setOpen] = useState(!cp.added_to_quotation);
  const [showRerun, setShowRerun] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'minutes' | 'extract' | 'notes' | 'transcript'
  >('extract');
  const [notesDraft, setNotesDraft] = useState(cp.raw_conversation ?? '');
  const [minutes, setMinutes] = useState(cp.summary_text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { columns } = useLineItemColumns();
  const enabledCols = columns.filter((c) => c.enabled);
  const [items, setItems] = useState<LineItemData[]>(() =>
    parseStoredItems(cp.structured_diff?.line_items)
  );
  const itemsRef = useRef(items);
  const [isExtracting, setIsExtracting] = useState(false);
  const { options: modelOptions, tier, setTier } = useModelTier();
  const [isSendingToQuotation, setIsSendingToQuotation] = useState(false);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const router = useRouter();

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
  const [questions, setQuestions] = useState<ExtractionQuestion[]>(
    extractionRecord?.questions ?? []
  );

  // On mount, patch any null units to the DB
  useEffect(() => {
    if (items.length === 0) return;
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
  const missingItems = findMissingItems(items, columns);

  const draft = !cp.added_to_quotation;
  const extractChars = (
    notesDraft ||
    cp.raw_conversation ||
    cp.summary_text ||
    ''
  ).length;

  /** Reads the notes again against the quotation as it stands now. */
  async function runExtract(source?: string) {
    const text =
      source ?? (notesDraft || cp.raw_conversation || cp.summary_text);
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
        questions: result.questions,
      };
      const newMinutes = result.meeting_minutes.join('\n');
      await api.patch(`/checkpoints/${cp.id}/extracted-items`, {
        line_items: newItems,
        extraction: record,
        summary_text: newMinutes,
      });
      itemsRef.current = newItems;
      setItems(newItems);
      setRanAt(record.ran_at);
      setUnmappedNotes(result.unmapped_notes);
      setQuestions(result.questions);
      setMinutes(newMinutes);
      setActiveTab('extract');
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

  /** Applies an edit and persists the result; a failed save is surfaced. */
  function commitItems(edit: (prev: LineItemData[]) => LineItemData[]) {
    // Computed outside a state updater so the save fires once, even in
    // StrictMode where updaters run twice.
    const next = edit(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    saveExtractedItems(cp.id, next);
  }

  /** Add an empty row so a thin or empty extraction is not a dead end. */
  function addManualItem() {
    commitItems((prev) => [...prev, blankItem()]);
  }

  function updateItem(
    idx: number,
    field: keyof LineItemData,
    value: string | number | boolean | null
  ) {
    commitItems((prev) => updateItemAt(prev, idx, field, value));
  }

  function updateItemExtra(
    idx: number,
    key: string,
    value: string | number | null
  ) {
    commitItems((prev) => updateExtraAt(prev, idx, key, value));
  }

  function toggleVerifyAll() {
    // If all verified → unverify all; otherwise verify all
    commitItems((prev) => setAllVerified(prev, !allVerified));
  }

  /** Saves the edited notes, then reads them again. */
  async function saveNotesAndCheck(text: string) {
    setIsExtracting(true);
    try {
      await updateCheckpointNotes(cp.id, text);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the notes'));
      setIsExtracting(false);
      return;
    }
    setIsExtracting(false);
    await runExtract(text);
  }

  /** One-click answer to a question: the sentence joins the notes. */
  function useSuggestedNote(note: string) {
    const base = (notesDraft || cp.raw_conversation || '').trim();
    const next = base ? `${base}\n${note}` : note;
    setNotesDraft(next);
    void saveNotesAndCheck(next);
  }

  async function removeMeeting() {
    setIsDeleting(true);
    try {
      await deleteCheckpoint(cp.id);
      toast.success(`Meeting #${number} deleted`);
      onQuotationUpdated();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the notes'));
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  const addDisabledReason = addDisabledReasonFor({
    sending: isSendingToQuotation,
    missingCount: missingItems.length,
    verifiedCount,
  });

  const addSummary = summarizeVerified(items);

  async function sendToQuotation() {
    if (missingItems.length > 0) return;
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
        toQuotationPayload(verifiedItems)
      );
      const msg =
        result.action === 'created' ? 'Quotation created' : 'Quotation updated';
      const counts = [
        `${result.items_added} added`,
        `${result.items_updated} updated`,
        ...(result.items_removed ? [`${result.items_removed} removed`] : []),
        ...(result.items_skipped
          ? [
              `${result.items_skipped} skipped (item no longer on the quotation)`,
            ]
          : []),
      ];
      toast.success(`${msg} — ${counts.join(', ')}`, {
        action: {
          label: 'View quotation',
          onClick: () =>
            router.push(`/dashboard/clients/${clientId}/quotation`),
        },
      });
      setConfirmAdd(false);
      onQuotationUpdated();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update quotation'));
    } finally {
      setIsSendingToQuotation(false);
    }
  }

  const rawText = cp.audio_transcript || cp.raw_conversation;
  const bullets = minutes ? minutesBullets(minutes) : [];

  const TAB_LABELS: {
    key: 'minutes' | 'extract' | 'notes' | 'transcript';
    label: string;
  }[] = [
    {
      key: 'extract',
      label: `Rows${hasItems ? ` (${items.length})` : ''}`,
    },
    { key: 'minutes', label: 'Minutes' },
    ...(draft
      ? [{ key: 'notes' as const, label: 'Notes' }]
      : rawText
        ? [{ key: 'transcript' as const, label: 'Transcript' }]
        : []),
  ];

  return (
    <div className="surface">
      {/* Card header: one tap folds or unfolds the meeting */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-4 py-2 text-left ${
          open ? 'border-b border-line dark:border-line' : ''
        }`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-dark-500 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="badge bg-primary-100/70 text-dark-700 dark:bg-white/10 dark:text-dark-200">
            Meeting #{number}
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
          {cp.source} ·{' '}
          <time dateTime={cp.created_at}>
            {new Date(cp.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </span>
      </button>

      {open && (
        <>
          {/* Tabs — scroll horizontally if they don't fit */}
          <div className="px-4 pt-3">
            <div role="tablist" aria-label="Meeting sections" className="seg">
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
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
                {bullets.length > 0 ? (
                  bullets.map((line, i) => (
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

            {/* Notes tab: change what was said, then read it again */}
            {activeTab === 'notes' && draft && (
              <div className="space-y-2 pt-2">
                <label className="block">
                  <span className="field-label">
                    Notes for meeting #{number}
                  </span>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={8}
                    className="field min-h-[140px]"
                    placeholder="What the client said"
                  />
                </label>
                <p
                  className={`text-xs tabular-nums ${
                    notesDraft.length > MAX_EXTRACT_CHARS
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-dark-500 dark:text-dark-400'
                  }`}
                >
                  {notesDraft.length.toLocaleString()} /{' '}
                  {MAX_EXTRACT_CHARS.toLocaleString()} characters
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveNotesAndCheck(notesDraft)}
                    disabled={
                      isExtracting ||
                      !notesDraft.trim() ||
                      notesDraft.length > MAX_EXTRACT_CHARS
                    }
                    className="btn-primary"
                  >
                    {isExtracting ? 'Checking…' : 'Save notes and check again'}
                  </button>
                  <p className="text-xs text-dark-500 dark:text-dark-400">
                    The rows are redrafted against the quotation as it is now.
                  </p>
                </div>
                {isExtracting && <ExtractionProgress chars={extractChars} />}
              </div>
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
                {draft && (
                  <MeetingQuestions
                    questions={questions}
                    busy={isExtracting}
                    onUseNote={useSuggestedNote}
                  />
                )}
                {!hasItems ? (
                  <NoItemsPanel
                    hasRun={hasRun}
                    ranAt={ranAt}
                    unmappedNotes={unmappedNotes}
                    tier={tier}
                    modelOptions={modelOptions}
                    isExtracting={isExtracting}
                    extractChars={extractChars}
                    onTierChange={setTier}
                    onAddManual={addManualItem}
                    onRunExtract={() => runExtract()}
                  />
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
                        {cp.applied_at && (
                          <>
                            Added to the quotation
                            {cp.applied_by_name
                              ? ` by ${cp.applied_by_name}`
                              : ''}{' '}
                            on{' '}
                            {new Date(cp.applied_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                            .{' '}
                          </>
                        )}
                        To change these rows, edit the quotation and save a
                        version.{' '}
                        <Link
                          href={`/dashboard/clients/${clientId}/quotation`}
                          className="text-brand-600 dark:text-brand-400 font-medium underline-offset-2 hover:underline"
                        >
                          View in quotation →
                        </Link>
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

                    <ItemsGrid
                      items={items}
                      enabledCols={enabledCols}
                      columns={columns}
                      locked={cp.added_to_quotation}
                      onChangeField={(idx, key, value, isCustom) =>
                        isCustom
                          ? updateItemExtra(idx, key, value)
                          : updateItem(idx, key as keyof LineItemData, value)
                      }
                      onVerify={(idx, v) => updateItem(idx, 'verified', v)}
                    />

                    {showRerun && !cp.added_to_quotation && (
                      <div className="space-y-2 rounded-xl bg-surface-2 p-3 dark:border-line">
                        <ModelTierPicker
                          tier={tier}
                          onChange={setTier}
                          options={modelOptions}
                          disabled={isExtracting}
                        />
                        <button
                          onClick={() => runExtract()}
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
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={() => setConfirmAdd(true)}
                              disabled={Boolean(addDisabledReason)}
                              aria-describedby={
                                addDisabledReason
                                  ? `add-reason-${cp.id}`
                                  : undefined
                              }
                              className="btn-primary"
                            >
                              {isSendingToQuotation
                                ? 'Updating…'
                                : `Add to Quotation (${verifiedCount})`}
                            </button>
                            {addDisabledReason && (
                              <p
                                id={`add-reason-${cp.id}`}
                                className="text-xs text-dark-500 dark:text-dark-400"
                              >
                                {addDisabledReason}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Modal
                      open={confirmAdd}
                      onClose={() => setConfirmAdd(false)}
                      title="Add to quotation?"
                      maxWidth="md"
                    >
                      <p className="mb-2 text-dark-600 dark:text-dark-400">
                        {verifiedCount} verified row
                        {verifiedCount === 1 ? '' : 's'} will change the
                        quotation:
                      </p>
                      <ul className="mb-4 list-disc pl-5 text-sm text-dark-700 dark:text-dark-300">
                        {Object.entries(addSummary).map(([action, n]) => (
                          <li key={action}>
                            {n} to {action}
                          </li>
                        ))}
                      </ul>
                      <p className="mb-6 text-xs text-dark-500 dark:text-dark-400">
                        This is recorded with your name and the time. It can be
                        undone while nothing was added after it.
                      </p>
                      <ModalFooter
                        onCancel={() => setConfirmAdd(false)}
                        onConfirm={sendToQuotation}
                        confirmLabel="Add to quotation"
                        loading={isSendingToQuotation}
                        loadingLabel="Updating…"
                      />
                    </Modal>
                  </>
                )}
              </div>
            )}
          </div>

          {draft && (
            <div className="flex justify-end border-t border-line px-4 py-1 dark:border-line">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="link-action-muted !text-red-600 dark:!text-red-400"
              >
                Delete these notes
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDeleteModal
        isOpen={confirmDelete}
        isLoading={isDeleting}
        title={`Delete meeting #${number}?`}
        description="The notes and the rows drafted from them are removed. Nothing on the quotation changes."
        confirmLabel="Delete notes"
        onConfirm={removeMeeting}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

'use client';

import type { ModelOption, ModelTier } from '@/lib/aiModels';
import { ExtractionProgress } from '@/components/shared/ExtractionProgress';
import { ModelTierPicker } from '@/components/shared/ModelTierPicker';
import { NotePanel } from './ItemEditor';

interface NoItemsPanelProps {
  /** Extraction has run on this meeting (even if it found nothing). */
  hasRun: boolean;
  ranAt: string | null;
  unmappedNotes: string[];
  tier: ModelTier;
  modelOptions: ModelOption[];
  isExtracting: boolean;
  extractChars: number;
  onTierChange: (tier: ModelTier) => void;
  onAddManual: () => void;
  onRunExtract: () => void;
}

/** Empty rows tab: offer extraction, or explain that it found nothing. */
export function NoItemsPanel({
  hasRun,
  ranAt,
  unmappedNotes,
  tier,
  modelOptions,
  isExtracting,
  extractChars,
  onTierChange,
  onAddManual,
  onRunExtract,
}: NoItemsPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {hasRun ? (
        // Extraction ran and produced nothing. Saying so — and
        // offering a manual row — is the difference between a
        // result and an apparent dead end.
        <>
          <p className="text-sm text-dark-500 dark:text-dark-300">
            AI extraction ran
            {ranAt ? ` on ${new Date(ranAt).toLocaleString()}` : ''} and found
            no quotation line items in this text.
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
              onChange={onTierChange}
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
            <button onClick={onAddManual} className="btn-primary">
              + Add a line item
            </button>
            <button
              onClick={onRunExtract}
              disabled={isExtracting}
              className="btn-secondary"
            >
              {isExtracting ? 'Re-extracting…' : 'Re-run extraction'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-dark-500 dark:text-dark-400">
            No AI extraction yet for this meeting.
          </p>
          <div className="w-full text-left">
            <ModelTierPicker
              tier={tier}
              onChange={onTierChange}
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
            onClick={onRunExtract}
            disabled={isExtracting}
            className="btn-primary"
          >
            {isExtracting ? 'Extracting…' : 'Run AI Extract'}
          </button>
        </>
      )}
    </div>
  );
}

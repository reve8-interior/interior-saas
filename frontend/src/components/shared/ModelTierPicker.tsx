'use client';

import { type ModelOption, type ModelTier, formatUsd } from '@/lib/aiModels';
import { INPUT_CLS } from '@/lib/constants';
import { Sparkles } from 'lucide-react';

export const TAG_STYLES: Record<ModelTier, string> = {
  economy:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  balanced:
    'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  premium:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

const optionText = (o: ModelOption) =>
  `${o.label} · about ${formatUsd(o.est_cost_per_extraction_usd)} per run`;

/** Dropdown for the price tier an AI request runs on. */
export function ModelTierPicker({
  tier,
  onChange,
  options,
  disabled = false,
  compact = false,
}: {
  tier: ModelTier;
  onChange: (tier: ModelTier) => void;
  options: ModelOption[];
  disabled?: boolean;
  /** Single-line select for toolbars; the tag and blurb move to a tooltip. */
  compact?: boolean;
}) {
  if (options.length === 0) return null;
  const selected = options.find((o) => o.tier === tier) ?? options[0];
  if (compact)
    return (
      <div
        title={`${selected.blurb} (${selected.model})`}
        className={`ring-current/20 flex items-center gap-2 rounded-full py-1 pl-3 pr-1 ring-1 ring-inset ${TAG_STYLES[selected.tier]}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <label
          className="text-xs font-bold uppercase tracking-wide"
          htmlFor="ai-model-tier"
        >
          AI model
        </label>
        <select
          id="ai-model-tier"
          className="cursor-pointer rounded-full border-0 bg-white/80 py-1.5 pl-3 pr-8 text-sm font-semibold text-dark-900 focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-dark-900/70 dark:text-white"
          value={selected.tier}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as ModelTier)}
        >
          {options.map((o) => (
            <option key={o.tier} value={o.tier}>
              {optionText(o)}
            </option>
          ))}
        </select>
      </div>
    );
  return (
    <div className="space-y-1">
      <label className="field-label" htmlFor="ai-model-tier">
        AI model
      </label>
      <select
        id="ai-model-tier"
        className={INPUT_CLS}
        value={selected.tier}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ModelTier)}
      >
        {options.map((o) => (
          <option key={o.tier} value={o.tier}>
            {optionText(o)}
          </option>
        ))}
      </select>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dark-500 dark:text-dark-400">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${TAG_STYLES[selected.tier]}`}
        >
          {selected.label}
        </span>
        <span>{selected.blurb}</span>
        <span className="opacity-70">({selected.model})</span>
      </p>
    </div>
  );
}

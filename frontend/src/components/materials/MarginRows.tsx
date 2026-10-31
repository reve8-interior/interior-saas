'use client';

import { parseMargin } from '@/lib/materials';
import { useId, useState } from 'react';
import { CATEGORY_LIST } from '@/components/materials/MaterialFields';

// ── Margin row ───────────────────────────────────────────────────────────────
export function MarginRow({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (percent: number) => Promise<void>;
}) {
  const [text, setText] = useState(String(value));
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid'>('idle');

  const commit = async () => {
    const parsed = parseMargin(text);
    if (parsed === null) {
      setStatus('invalid');
      return;
    }
    if (parsed === value) {
      setStatus('idle');
      return;
    }
    try {
      await onSave(parsed);
      setStatus('saved');
    } catch {
      setStatus('idle');
      setText(String(value));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="w-32 shrink-0 text-sm font-medium text-dark-700 dark:text-dark-300 sm:w-36">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="any"
        value={text}
        aria-label={`Margin percent for ${label}`}
        aria-invalid={status === 'invalid'}
        onChange={(e) => {
          setText(e.target.value);
          setStatus('idle');
        }}
        onBlur={commit}
        className="field !w-24 !py-1.5"
      />
      <span className="text-sm text-dark-500 dark:text-dark-400">%</span>
      <span aria-live="polite" className="min-w-16 text-xs">
        {status === 'saved' && (
          <span className="text-green-600 dark:text-green-400">Saved</span>
        )}
        {status === 'invalid' && (
          <span className="text-red-600 dark:text-red-400">
            Enter a number from 0 to 100
          </span>
        )}
      </span>
    </div>
  );
}

export function AddMarginRow({
  onAdd,
}: {
  onAdd: (category: string, percent: number) => Promise<void>;
}) {
  const [category, setCategory] = useState('');
  const [percent, setPercent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  const add = async () => {
    const parsed = parseMargin(percent);
    if (!category.trim()) return setError('Choose or type a category');
    if (parsed === null) return setError('Enter a percent from 0 to 100');
    setError(null);
    setBusy(true);
    try {
      await onAdd(category.trim(), parsed);
      setCategory('');
      setPercent('');
    } catch {
      // The mutation already toasted the backend message.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line pt-3 dark:border-line">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${uid}-cat`} className="field-label">
            Category
          </label>
          <input
            id={`${uid}-cat`}
            list={CATEGORY_LIST}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. plywood"
            autoComplete="off"
            className="field !w-44 !py-1.5"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-pct`} className="field-label">
            Margin %
          </label>
          <input
            id={`${uid}-pct`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="field !w-24 !py-1.5"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="btn-secondary"
        >
          Add category margin
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

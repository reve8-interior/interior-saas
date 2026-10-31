'use client';

import { useState } from 'react';
import type { LineItemStatus } from '@/lib/schemas/quotation';

/** A table number that becomes an input on click; Enter or blur saves, Escape cancels. */
export function InlineNumberCell({
  value,
  label,
  display,
  onSave,
}: {
  value: number | null;
  /** Accessible name, e.g. "Rate for Modular cabinets". */
  label: string;
  display: string;
  onSave: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    const next = text === '' ? null : Number(text);
    if (next !== null && (isNaN(next) || next < 0)) return;
    if (next !== value) onSave(next);
  };

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value != null ? String(value) : '')}
        aria-label={`Edit ${label}`}
        className="-mx-2 min-h-11 rounded-lg px-2 text-left hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-white/10"
      >
        {display}
      </button>
    );
  }
  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="field w-24 !py-1"
    />
  );
}

/** Status badge that is also a one-click selector. */
export function InlineStatusSelect({
  value,
  options,
  label,
  className,
  onChange,
}: {
  value: LineItemStatus;
  options: LineItemStatus[];
  label: string;
  className: string;
  onChange: (next: LineItemStatus) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as LineItemStatus)}
      className={`badge min-h-control cursor-pointer appearance-none border-0 pr-3 ${className}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}

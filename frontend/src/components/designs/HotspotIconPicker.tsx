'use client';

import { CaretDown } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { HOTSPOT_ICONS, NUMBER_ICON, hotspotIcon } from '@/lib/hotspotIcons';

interface HotspotIconPickerProps {
  /** '' = Auto (guess from the label), 'number' = plain number, else an icon key. */
  value: string;
  /** The hotspot's label, so Auto can show the icon it would pick. */
  label: string;
  onChange: (key: string) => void;
}

const OPTION_CLS =
  'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-[10px] transition-colors';

/**
 * One compact button showing the pin's current icon; opens a searchable grid.
 * Keeps the 20 icons out of the form until the designer wants to change one.
 */
export function HotspotIconPicker({
  value,
  label,
  onChange,
}: HotspotIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close only the picker, not the editor modal behind it.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const Current = hotspotIcon(label, value);
  const currentName =
    value === NUMBER_ICON
      ? 'Number'
      : value
        ? (HOTSPOT_ICONS.find((i) => i.key === value)?.label ?? 'Auto')
        : 'Auto';

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const needle = query.trim().toLowerCase();
  const icons = HOTSPOT_ICONS.filter(
    (i) => !needle || i.label.toLowerCase().includes(needle)
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Pin icon: ${currentName}`}
        className="flex h-11 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-text transition-colors hover:bg-text/5"
      >
        {Current ? (
          <Current className="h-5 w-5" weight="light" aria-hidden />
        ) : (
          <span className="w-5 text-center text-sm font-bold" aria-hidden>
            #
          </span>
        )}
        <CaretDown className="h-3 w-3 text-muted" aria-hidden />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose a pin icon"
          className="absolute left-0 top-full z-30 mt-2 w-72 space-y-2 rounded-2xl border border-line bg-surface p-3 shadow-glass"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons"
            aria-label="Search icons"
            autoFocus
            className="field w-full"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {!needle && (
              <button
                type="button"
                aria-pressed={value === ''}
                onClick={() => pick('')}
                title="Pick from the label"
                className={`${OPTION_CLS} ${
                  value === ''
                    ? 'border-primary-500 bg-primary-500/10 text-text'
                    : 'border-line text-muted hover:bg-text/5'
                }`}
              >
                <span className="text-sm font-bold" aria-hidden>
                  A
                </span>
                <span>Auto</span>
              </button>
            )}
            {icons.map(({ key, label: name, icon: Ico }) => (
              <button
                key={key}
                type="button"
                aria-pressed={value === key}
                onClick={() => pick(key)}
                title={name}
                className={`${OPTION_CLS} ${
                  value === key
                    ? 'border-primary-500 bg-primary-500/10 text-text'
                    : 'border-line text-muted hover:bg-text/5'
                }`}
              >
                <Ico className="h-5 w-5" weight="light" aria-hidden />
                <span className="max-w-full truncate px-0.5">{name}</span>
              </button>
            ))}
            {!needle && (
              <button
                type="button"
                aria-pressed={value === NUMBER_ICON}
                onClick={() => pick(NUMBER_ICON)}
                title="Show the pin number"
                className={`${OPTION_CLS} ${
                  value === NUMBER_ICON
                    ? 'border-primary-500 bg-primary-500/10 text-text'
                    : 'border-line text-muted hover:bg-text/5'
                }`}
              >
                <span className="text-sm font-bold" aria-hidden>
                  #
                </span>
                <span>Number</span>
              </button>
            )}
          </div>
          {icons.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted">
              No icon matches “{query}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

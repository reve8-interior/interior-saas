'use client';

import { MoreHorizontal } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** Overflow ("...") menu for secondary row actions; keyboard and touch friendly. */
export function RowMenu({
  label,
  items,
  compact = false,
}: {
  /** Accessible name, e.g. "More actions for Jane". */
  label: string;
  items: RowMenuItem[];
  /** Borderless and smaller, for use inside cards. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The menu is fixed to the viewport so scrolling or clipping parents (board columns, tables) can't cut it off.
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const buttons = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)'
        ) ?? []
      );
    buttons()[0]?.focus();
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'Tab') {
        setOpen(false);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = buttons();
        const idx = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = idx + (e.key === 'ArrowDown' ? 1 : -1);
        list[(next + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const right = window.innerWidth - r.right;
      const needed = items.length * 44 + 20;
      setPos(
        window.innerHeight - r.bottom < needed && r.top > needed
          ? { bottom: window.innerHeight - r.top + 4, right }
          : { top: r.bottom + 4, right }
      );
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={`inline-flex items-center justify-center rounded-full text-dark-700 hover:bg-primary-50/70 dark:text-dark-300 dark:hover:bg-white/[0.06] ${
          compact ? 'h-9 w-9' : 'h-11 w-11 border border-line'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && pos && (
        <div
          id={id}
          style={pos}
          ref={menuRef}
          role="menu"
          className="fixed z-40 w-48 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-glass"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium hover:bg-text/5 disabled:opacity-50 ${
                item.danger ? 'text-red-600 dark:text-red-400' : 'text-text'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

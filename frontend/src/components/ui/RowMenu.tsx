'use client';

import { MoreHorizontal } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
    maxHeight: number;
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
    // preventScroll: focusing must not fire a scroll event, which would close the menu at once.
    buttons()[0]?.focus({ preventScroll: true });
    const close = (e?: Event) => {
      if (e?.target instanceof Node && menuRef.current?.contains(e.target))
        return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t))
        setOpen(false);
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
      // Keep the 12rem menu inside the viewport horizontally (8px margin) even when the trigger hugs the left edge.
      const right = Math.min(
        Math.max(window.innerWidth - r.right, 8),
        Math.max(window.innerWidth - 192 - 8, 8)
      );
      const needed = items.length * 44 + 20;
      const below = window.innerHeight - r.bottom - 8;
      // Open upward when there is more room above; the menu scrolls if neither side fits it.
      setPos(
        below < needed && r.top > below
          ? {
              bottom: window.innerHeight - r.top + 4,
              right,
              maxHeight: r.top - 12,
            }
          : { top: r.bottom + 4, right, maxHeight: Math.max(below, 120) }
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
        className={`icon-btn ${compact ? 'icon-btn-sm' : 'border border-line'}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            id={id}
            style={pos}
            ref={menuRef}
            role="menu"
            className="fixed z-40 w-48 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-glass"
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
          </div>,
          document.body
        )}
    </div>
  );
}

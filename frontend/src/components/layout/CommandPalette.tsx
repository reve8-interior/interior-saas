'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { buildEntries, searchEntries } from '@/lib/commandPalette';
import type { Client } from '@/lib/schemas/client';
import { useFocusTrap } from '@/lib/useFocusTrap';

const OPEN_EVENT = 'open-command-palette';

/** Visible way in for people who don't know the shortcut. */
export function CommandPaletteButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="hidden min-h-control items-center gap-2 rounded-control border border-line px-4 text-sm text-dark-600 hover:bg-primary-50/70 dark:text-dark-300 dark:hover:bg-white/[0.06] lg:inline-flex"
    >
      <Search className="h-4 w-4" aria-hidden />
      Search
      <kbd className="rounded border border-line px-1.5 text-xs">Ctrl K</kbd>
    </button>
  );
}

/**
 * Jump to any page or client section from the keyboard: Ctrl/Cmd+K, type,
 * Enter. Clients come from the same cached list the Clients page uses.
 */
export function CommandPalette({
  pages,
}: {
  pages: { name: string; href: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', false],
    queryFn: () => api.get<Client[]>('/clients'),
    enabled: open,
  });

  const entries = useMemo(() => buildEntries(pages, clients), [pages, clients]);
  const results = useMemo(
    () => searchEntries(entries, query),
    [entries, query]
  );

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active].href);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-dark-950/60 backdrop-blur-md"
        onClick={close}
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10dvh] sm:pt-[15dvh]">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Search and jump"
          className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-xl dark:bg-dark-800"
        >
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="h-4 w-4 text-dark-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Jump to a client or page…"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={
                results[active] ? `palette-${results[active].id}` : undefined
              }
              className="h-12 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul
            id="palette-results"
            role="listbox"
            className="max-h-80 overflow-y-auto py-1"
          >
            {results.length === 0 && (
              <li className="px-4 py-3 text-sm text-dark-500 dark:text-dark-400">
                Nothing matches “{query}”.
              </li>
            )}
            {results.map((entry, i) => (
              <li
                key={entry.id}
                id={`palette-${entry.id}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(entry.href)}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-sm ${
                  i === active
                    ? 'bg-primary-50 text-primary-800 dark:bg-white/10 dark:text-white'
                    : ''
                }`}
              >
                <span className="truncate">{entry.label}</span>
                <span className="shrink-0 text-xs text-dark-500 dark:text-dark-400">
                  {entry.hint}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-dark-500 dark:text-dark-400">
            ↑ ↓ to move · Enter to open · Esc to close
          </p>
        </div>
      </div>
    </>
  );
}

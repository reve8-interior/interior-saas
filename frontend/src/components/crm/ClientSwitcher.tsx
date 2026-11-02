'use client';

import { useQuery } from '@tanstack/react-query';
import { CaretUpDown, Check } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Client } from '@/lib/schemas/client';

interface ClientSwitcherProps {
  clientId: string;
  /** Shown while the current client is still loading. */
  name?: string;
  /** Current URL path; the same tab is kept when switching. */
  pathname: string;
}

/** Client name as the page title, opening a list to jump to another client on the same tab. */
export function ClientSwitcher({
  clientId,
  name,
  pathname,
}: ClientSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/clients'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const switchTo = (id: string) => {
    setOpen(false);
    if (id === clientId) return;
    router.push(pathname.replace(`/clients/${clientId}`, `/clients/${id}`));
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch client"
        onClick={() => setOpen((o) => !o)}
        className="-mx-2 flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 hover:bg-primary-50 dark:hover:bg-white/[0.06]"
      >
        <span className="truncate">{name ?? 'Client'}</span>
        <CaretUpDown
          className="h-4 w-4 shrink-0 text-dark-500 dark:text-dark-400"
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Clients"
          className="surface absolute left-0 top-full z-40 mt-1 max-h-80 w-72 max-w-[85vw] overflow-y-auto p-1 text-sm font-normal shadow-lg"
        >
          {clients.length === 0 && (
            <li className="px-3 py-2 text-xs text-dark-500 dark:text-dark-400">
              Loading…
            </li>
          )}
          {clients.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === clientId}>
              <button
                type="button"
                onClick={() => switchTo(c.id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-primary-50 dark:hover:bg-white/[0.06]"
              >
                <span
                  className={`min-w-0 flex-1 truncate ${c.is_active ? '' : 'text-dark-500 dark:text-dark-400'}`}
                >
                  {c.name}
                </span>
                {c.id === clientId && (
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

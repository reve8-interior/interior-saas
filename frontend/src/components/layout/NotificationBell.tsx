'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ATTENTION_KEY,
  ATTENTION_POLL_MS,
  getAttention,
  markAttentionRead,
  type AttentionItem,
} from '@/lib/attention';
import { timeAgo } from '@/lib/dates';

const PANEL_GAP = 8;
const EDGE = 12;

/**
 * Bell with a count of everything waiting on the designer (customer replies
 * first). It sits in the header on every page and refreshes on its own, so a
 * customer's question shows up without opening any client or version.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const { data: all = [] } = useQuery<AttentionItem[]>({
    queryKey: ATTENTION_KEY,
    queryFn: getAttention,
    refetchInterval: ATTENTION_POLL_MS,
    refetchOnWindowFocus: true,
  });
  // Unread first; read items stay listed, dimmed, until they stop applying.
  const items = [...all].sort((a, b) => Number(a.read) - Number(b.read));

  // Update the badge at once; the server call follows.
  const markRead = useMutation({
    mutationFn: markAttentionRead,
    onMutate: (keys: string[]) =>
      qc.setQueryData<AttentionItem[]>(ATTENTION_KEY, (prev) =>
        prev?.map((i) => (keys.includes(i.key) ? { ...i, read: true } : i))
      ),
    onError: () => qc.invalidateQueries({ queryKey: ATTENTION_KEY }),
  });
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open) return setPos(null);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + PANEL_GAP,
      right: Math.max(EDGE, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t))
        close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const unread = items.filter((i) => !i.read);
  const count = unread.length;
  const replies = unread.filter((i) => i.kind === 'customer_question').length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          count ? `Notifications, ${count} waiting on you` : 'Notifications'
        }
        className="relative flex h-11 w-11 items-center justify-center text-text transition-colors hover:text-brand lg:h-[var(--control-h)] lg:w-[var(--control-h)]"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {count > 0 && (
          <span
            className={`absolute right-0.5 top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums leading-[1.125rem] text-white ${
              replies ? 'bg-red-600' : 'bg-amber-600'
            }`}
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            style={{ top: pos.top, right: pos.right }}
            className="surface fixed z-[60] max-h-[min(32rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain p-2 shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2">
              <p className="text-sm font-semibold">Waiting on you</p>
              {count > 0 && (
                <button
                  type="button"
                  className="link-action"
                  onClick={() => markRead.mutate(unread.map((i) => i.key))}
                >
                  Mark all as read
                </button>
              )}
            </div>
            {count === 0 && (
              <p className="px-3 pb-3 text-sm text-muted">
                You&apos;re all caught up.
              </p>
            )}
            {items.length > 0 && (
              <ul>
                {items.map((item) => (
                  <li key={`${item.kind}-${item.path}`}>
                    <Link
                      href={item.path}
                      onClick={() => {
                        setPos(null);
                        if (!item.read) markRead.mutate([item.key]);
                      }}
                      className={`flex min-h-11 flex-col gap-0.5 rounded-control px-3 py-2 hover:bg-text/5 ${
                        item.read ? 'opacity-60' : ''
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          {!item.read && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-red-600"
                              aria-label="Unread"
                            />
                          )}
                          <span className="truncate">{item.client_name}</span>
                        </span>
                        {item.at && (
                          <span className="shrink-0 text-xs text-muted">
                            {timeAgo(item.at)}
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-muted">{item.title}</span>
                      {item.detail && (
                        <span className="line-clamp-2 text-xs text-muted">
                          “{item.detail}”
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

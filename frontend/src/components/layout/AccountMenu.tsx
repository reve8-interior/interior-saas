'use client';

import { useTheme } from '@/components/providers/ThemeProvider';
import { AuthUser } from '@/lib/schemas';
import { AccessStatus } from '@/lib/schemas/auth';
import { GearSix, Moon, SignOut, Sun } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

interface AccountMenuProps {
  user: AuthUser | null;
  businessName?: string | null;
  access?: AccessStatus;
  onLogout: () => void;
  /** Collapsed sidebar shows the avatar only. */
  collapsed?: boolean;
}

const ITEM_CLS =
  'flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-medium text-text transition-colors hover:bg-text/5';

/**
 * Desktop account control at the bottom of the sidebar: avatar and name that
 * open a menu (beside the sidebar) with identity, theme, settings and sign-out.
 */
export function AccountMenu({
  user,
  businessName,
  access,
  onLogout,
  collapsed = false,
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const isDark = theme === 'dark';
  const settingsHref = pathname.startsWith('/admin')
    ? '/admin/settings'
    : '/dashboard/settings';
  const email = user?.email ?? '';
  const first = email.split('@')[0]?.split('.')[0] || 'User';
  const displayName = first.charAt(0).toUpperCase() + first.slice(1);
  const initial = displayName.charAt(0);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const items = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []
      );
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const list = items();
      const idx = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      list[(next + list.length) % list.length]?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative mx-4 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={collapsed ? displayName : undefined}
        className="flex min-h-12 w-full items-center rounded-control text-left transition-colors hover:bg-text/5"
      >
        <span className="flex w-12 shrink-0 items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {initial}
          </span>
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 pr-3">
            <span className="block truncate text-sm font-semibold text-side-fg">
              {displayName}
            </span>
            <span className="block truncate text-xs text-side-muted">
              {email}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute bottom-0 left-full z-50 ml-6 w-64 origin-bottom-left overflow-hidden rounded-2xl border border-line bg-surface shadow-glass"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-text">
              {displayName}
            </p>
            <p className="truncate text-xs text-faint">{email}</p>
            {businessName && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span className="truncate font-medium">{businessName}</span>
                {access && (
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-text">
                    {access.plan}
                    {access.days_left != null && ` · ${access.days_left}d`}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-0.5 p-2">
            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ITEM_CLS}
            >
              <GearSix className="h-4 w-4 shrink-0" />
              Account Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(isDark ? 'light' : 'dark');
                setOpen(false);
              }}
              className={ITEM_CLS}
            >
              {isDark ? (
                <Sun className="h-4 w-4 shrink-0" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className={`${ITEM_CLS} !text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-500/10`}
            >
              <SignOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

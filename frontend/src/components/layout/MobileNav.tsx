'use client';

import { useTheme } from '@/components/providers/ThemeProvider';
import type { NavSection } from '@/components/layout/AppSidebar';
import { isNavItemActive } from '@/components/layout/AppSidebar';
import { AuthUser } from '@/lib/schemas';
import { AccessStatus } from '@/lib/schemas/auth';
import {
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

interface MobileNavProps {
  sections: NavSection[];
  label: string;
  businessName?: string | null;
  access?: AccessStatus;
  user: AuthUser | null;
  rootHref: string;
  onLogout: () => void;
}

const TAB_CLS = (active: boolean) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors ${
    active
      ? 'text-primary-700 dark:text-primary-300'
      : 'text-dark-500 hover:text-dark-900 dark:text-dark-400 dark:hover:text-white'
  }`;

const ICON_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full text-dark-700 transition-colors hover:bg-primary-50 dark:text-dark-200 dark:hover:bg-white/10';

/**
 * Phone navigation: a fixed, frosted-glass pill (logo, theme toggle, menu) that
 * floats over the page like the iOS status chrome. The menu opens as a floating
 * glass sheet underneath it instead of pushing or covering the page.
 */
export function MobileNav({
  sections,
  label,
  businessName,
  access,
  user,
  rootHref,
  onLogout,
}: MobileNavProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Up to four primary destinations get a one-tap slot; the rest live under More.
  const tabItems = sections[0]?.items.slice(0, 4) ?? [];

  const isDark = theme === 'dark';
  const settingsHref = pathname.startsWith('/admin')
    ? '/admin/settings'
    : '/dashboard/settings';
  const email = user?.email ?? '';
  const displayName = email.split('@')[0]?.split('.')[0] || 'User';

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; the page behind stays put while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-dark-950/40 backdrop-blur-[3px]"
        />
      )}

      <header className="mobile-nav-pill ios-pill fixed inset-x-3 z-50 flex h-14 items-center justify-between rounded-full pl-4 pr-1.5">
        <Link
          href={rootHref}
          className="flex items-center gap-2"
          aria-label={label}
        >
          <img
            src="/icon.svg"
            alt=""
            className="h-auto w-[33px] translate-y-[1.5px]"
          />
          <span className="font-heading text-2xl font-extrabold leading-none tracking-tight">
            <span className="text-[#1573cc]">reve</span>
            <span className="text-dark-900 dark:text-white">8</span>
          </span>
        </Link>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={ICON_BTN}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="mobile-tab-bar ios-pill fixed inset-x-3 z-50 flex items-stretch justify-around rounded-full px-1"
      >
        {tabItems.map((item) => {
          const active = isNavItemActive(pathname, item, rootHref);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={TAB_CLS(active)}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span>{item.tabLabel ?? item.name}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className={TAB_CLS(open)}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
          <span>More</span>
        </button>
      </nav>

      {open && (
        <nav
          id={panelId}
          aria-label="Main menu"
          className="mobile-nav-panel ios-pill fixed inset-x-3 z-50 max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain rounded-3xl p-3"
        >
          {(businessName || label) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-primary-50/70 px-3 py-2.5 dark:bg-white/5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-dark-900 dark:text-white">
                  {businessName ?? label}
                </p>
                {businessName && label && (
                  <p className="text-xs capitalize text-dark-500 dark:text-dark-400">
                    {label}
                  </p>
                )}
              </div>
              {access && (
                <span className="shrink-0 rounded-full bg-primary-600/10 px-2.5 py-1 text-[11px] font-bold uppercase text-primary-700 dark:bg-primary-400/15 dark:text-primary-300">
                  {access.plan}
                </span>
              )}
            </div>
          )}

          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="eyebrow px-3 pb-1 pt-3 !text-[10px] !text-dark-500 dark:!text-dark-400">
                {section.title}
              </p>
              <ul>
                {section.items.map((item) => {
                  const active = isNavItemActive(pathname, item, rootHref);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 py-1.5 text-[15px] font-semibold transition-colors ${
                          active
                            ? 'bg-white text-primary-700 shadow-card dark:bg-primary-400/10 dark:text-primary-300 dark:shadow-none'
                            : 'text-dark-800 hover:bg-white/70 dark:text-dark-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            active
                              ? 'bg-primary-600 text-white'
                              : 'bg-primary-100/80 text-primary-700 dark:bg-white/10 dark:text-primary-300'
                          }`}
                        >
                          <item.icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="flex-1">{item.name}</span>
                        <ChevronRight className="h-4 w-4 text-dark-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-2 border-t border-line pt-2 dark:border-primary-300/10">
            <p className="truncate px-3 pb-1 text-xs text-dark-500 dark:text-dark-400">
              Signed in as{' '}
              <span className="font-semibold capitalize text-dark-800 dark:text-dark-100">
                {displayName}
              </span>
            </p>
            <Link
              href={settingsHref}
              className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold text-dark-800 hover:bg-white/70 dark:text-dark-100 dark:hover:bg-white/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100/80 text-primary-700 dark:bg-white/10 dark:text-primary-300">
                <Settings className="h-[18px] w-[18px]" />
              </span>
              Account settings
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <LogOut className="h-[18px] w-[18px]" />
              </span>
              Log out
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

'use client';

import { Logo } from '@/components/ui/Logo';
import { useTheme } from '@/components/providers/ThemeProvider';
import type { NavSection } from '@/components/layout/AppSidebar';
import { isNavItemActive, NavBadge } from '@/components/layout/AppSidebar';
import { planLabel } from '@/lib/plans';
import { AuthUser } from '@/lib/schemas';
import { AccessStatus } from '@/lib/schemas/auth';
import {
  CaretRight,
  DotsThree,
  GearSix,
  Moon,
  SignOut,
  Sun,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface MobileNavProps {
  sections: NavSection[];
  label: string;
  businessName?: string | null;
  access?: AccessStatus;
  user: AuthUser | null;
  rootHref: string;
  /** Shown beside the theme toggle in the top pill. */
  extra?: ReactNode;
  onLogout: () => void;
}

const TAB_CLS = (active: boolean) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors ${
    active ? 'bg-brand/10 text-accent-text' : 'text-muted hover:text-text'
  }`;

const ICON_BTN = 'icon-btn text-text';

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
  extra,
  onLogout,
}: MobileNavProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const moreRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
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
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      moreRef.current?.focus();
    };
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

      <header className="mobile-nav-pill ios-pill fixed inset-x-3 z-50 flex h-14 items-center justify-between rounded-full pl-5 pr-1.5">
        <Link
          href={rootHref}
          className="flex items-center gap-2"
          aria-label={label}
        >
          <Logo size={19} />
        </Link>
        <div className="flex items-center">
          {extra}
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
        className="mobile-tab-bar ios-pill fixed inset-x-3 z-50 flex items-stretch justify-around rounded-full px-1.5 py-1"
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
              <span className="relative">
                <item.icon
                  weight={active ? 'fill' : 'regular'}
                  className="h-5 w-5"
                  aria-hidden
                />
                {!!item.badge && (
                  <NavBadge
                    count={item.badge}
                    className="absolute -right-3 -top-2"
                  />
                )}
              </span>
              <span>{item.tabLabel ?? item.name}</span>
            </Link>
          );
        })}
        <button
          ref={moreRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={panelId}
          className={TAB_CLS(open)}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <DotsThree weight="bold" className="h-5 w-5" aria-hidden />
          )}
          <span>More</span>
        </button>
      </nav>

      {open && (
        <nav
          id={panelId}
          ref={panelRef}
          aria-label="Main menu"
          className="mobile-nav-panel ios-pill fixed inset-x-3 z-50 max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain rounded-3xl p-3"
        >
          {(businessName || label) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-text/[0.04] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">
                  {businessName ?? label}
                </p>
                {businessName && label && (
                  <p className="text-xs capitalize text-dark-500 dark:text-dark-400">
                    {label}
                  </p>
                )}
              </div>
              {access && (
                <span className="shrink-0 rounded-control bg-brand/10 px-2.5 py-1 text-[11px] font-semibold uppercase text-accent-text">
                  {planLabel(access.plan)}
                </span>
              )}
            </div>
          )}

          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="type-label px-3 pb-1 pt-3">{section.title}</p>
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
                            ? 'bg-brand/10 text-accent-text'
                            : 'text-text hover:bg-text/5'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            active
                              ? 'bg-brand text-white'
                              : 'bg-text/5 text-muted'
                          }`}
                        >
                          <item.icon
                            weight={active ? 'fill' : 'regular'}
                            className="h-[18px] w-[18px]"
                          />
                        </span>
                        <span className="flex-1">{item.name}</span>
                        {!!item.badge && <NavBadge count={item.badge} />}
                        <CaretRight className="h-4 w-4 text-dark-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-2 border-t border-line pt-2 dark:border-line">
            <p className="truncate px-3 pb-1 text-xs text-dark-500 dark:text-dark-400">
              Signed in as{' '}
              <span className="font-semibold capitalize text-dark-800 dark:text-dark-100">
                {displayName}
              </span>
            </p>
            <Link
              href={settingsHref}
              className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold text-text hover:bg-text/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-text/5 text-muted">
                <GearSix className="h-[18px] w-[18px]" />
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
                <SignOut className="h-[18px] w-[18px]" />
              </span>
              Log out
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

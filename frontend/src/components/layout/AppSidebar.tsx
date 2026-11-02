'use client';

import { AccountMenu } from '@/components/layout/AccountMenu';
import { Skeleton } from '@/components/ui';
import { Logo } from '@/components/ui/Logo';
import { AuthUser } from '@/lib/schemas';
import { isPaidPlan, planLabel } from '@/lib/plans';
import { AccessStatus } from '@/lib/schemas/auth';
import { Buildings, CaretLeft, type Icon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  name: string;
  /** Shorter label for the phone tab bar. */
  tabLabel?: string;
  href: string;
  icon: Icon;
  /** Other routes that belong to this item, so it stays highlighted there. */
  alsoActiveOn?: string[];
  /** Count shown on the item when above zero, e.g. unanswered messages. */
  badge?: number;
}

/** Small count pill for a nav item; the hidden text keeps it readable aloud. */
export function NavBadge({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={`flex min-w-[1.125rem] items-center justify-center rounded-control bg-red-600 px-1 text-[11px] font-bold tabular-nums leading-[1.125rem] text-white ${className}`}
    >
      {count > 9 ? '9+' : count}
      <span className="sr-only"> waiting on you</span>
    </span>
  );
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

interface AppSidebarProps {
  sections: NavSection[];
  label: string;
  showVersion?: boolean;
  businessName?: string | null;
  businessLoading?: boolean;
  access?: AccessStatus;
  isCollapsed: boolean;
  rootHref: string;
  onCollapse: () => void;
  user: AuthUser | null;
  onLogout: () => void;
}

export function isNavItemActive(
  pathname: string,
  item: NavItem,
  rootHref: string
): boolean {
  if (pathname === item.href) return true;
  if (item.alsoActiveOn?.some((p) => pathname.startsWith(p))) return true;
  if (pathname === '/' && item.href === rootHref) return true;
  if (item.href !== rootHref && pathname.startsWith(item.href)) return true;
  return false;
}

export function AppSidebar({
  sections,
  label,
  showVersion = false,
  businessName,
  businessLoading = false,
  access,
  isCollapsed,
  rootHref,
  onCollapse,
  user,
  onLogout,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-0 z-50 hidden h-full border-r border-side-line bg-side text-side-fg transition-all duration-300 lg:block ${
        isCollapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      <div className="flex h-full flex-col">
        {/* Header: logo + collapse button */}
        <div className="flex flex-col">
          <div className="relative flex h-[64px] items-center border-b border-side-line">
            <div className="flex w-20 shrink-0 items-center justify-center">
              <Logo size={16} markOnly />
            </div>
            <div
              className={`relative -ml-3 flex items-center whitespace-nowrap transition-all duration-300 ${
                isCollapsed
                  ? 'lg:max-w-0 lg:opacity-0'
                  : 'lg:max-w-[150px] lg:opacity-100'
              }`}
            >
              {/* Same row as the mark; the label hangs below without shifting the wordmark */}
              <div className="flex items-baseline gap-2">
                {/* Inter's lowercase sits below the line box centre; lift it level with the mark (same as Logo). */}
                <span
                  className="font-heading text-2xl font-bold leading-none tracking-tight text-side-fg"
                  style={{ transform: 'translateY(-0.08em)' }}
                >
                  <span className="text-brand">reve</span>8
                </span>
                {showVersion && (
                  <span className="text-[10px] text-side-muted">
                    v{process.env.NEXT_PUBLIC_FRONTEND_VERSION}
                  </span>
                )}
              </div>
              {label && (
                <span className="absolute left-0 top-full text-[11px] font-medium leading-none text-side-muted">
                  {label}
                </span>
              )}
            </div>
            <button
              onClick={onCollapse}
              className="absolute -right-3 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-side-line bg-side text-side-muted transition-colors hover:text-side-fg focus-visible:ring-2 focus-visible:ring-primary-500 lg:flex"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
            >
              <CaretLeft
                weight="bold"
                className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {businessLoading && !businessName && (
            <div className="mx-4 pb-1 pt-4" aria-hidden="true">
              <div className="flex min-h-10 items-center">
                <span className="flex w-12 shrink-0 justify-center">
                  <Skeleton className="h-4 w-4 rounded !bg-text/10" />
                </span>
                <Skeleton
                  className={`h-4 w-28 !bg-text/10 ${isCollapsed ? 'lg:hidden' : ''}`}
                />
              </div>
            </div>
          )}
          {businessName && (
            <div className="pb-1 pt-4" title={businessName}>
              {/* Same mx-4 + w-12 icon column as UserMenu and nav items, so text shares one left edge */}
              <div className="mx-4 flex min-h-10 items-center">
                <span className="flex w-12 shrink-0 items-center justify-center">
                  <Buildings className="h-4 w-4 text-side-muted" />
                </span>
                <div
                  className={`min-w-0 pr-2 transition-all duration-300 ${
                    isCollapsed ? 'lg:hidden' : ''
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-side-fg">
                    {businessName}
                  </p>
                  {access && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-side-muted">
                      <span
                        className={`badge font-semibold uppercase ${
                          isPaidPlan(access.plan)
                            ? 'bg-brand/15 text-accent-text'
                            : 'bg-text/5 text-side-muted'
                        }`}
                      >
                        {planLabel(access.plan)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mb-2 flex h-6 items-center px-4">
                <div
                  className={`w-full transition-opacity duration-300 ${
                    isCollapsed ? 'hidden opacity-0' : 'block opacity-100'
                  }`}
                >
                  <p className="px-3 text-[0.8125rem] font-medium leading-snug text-side-muted">
                    {section.title}
                  </p>
                </div>
                <div
                  className={`w-full transition-opacity duration-300 ${
                    isCollapsed ? 'block opacity-100' : 'hidden opacity-0'
                  }`}
                >
                  <div className="mx-auto h-px w-full bg-side-line" />
                </div>
              </div>
              <div className="mt-1 space-y-1">
                {section.items.map((item) => {
                  const active = isNavItemActive(pathname, item, rootHref);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={isCollapsed ? item.name : ''}
                      aria-current={active ? 'page' : undefined}
                      aria-label={isCollapsed ? item.name : undefined}
                      className={`relative mx-4 flex items-center rounded-control py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-brand/10 font-semibold text-accent-text'
                          : 'text-side-muted hover:bg-text/5 hover:text-side-fg'
                      }`}
                    >
                      <span className="flex w-12 shrink-0 items-center justify-center">
                        <item.icon
                          weight={active ? 'fill' : 'regular'}
                          className="h-5 min-h-[20px] w-5 min-w-[20px]"
                          aria-hidden
                        />
                      </span>
                      <span
                        className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                          isCollapsed
                            ? 'lg:max-w-0 lg:opacity-0'
                            : 'lg:max-w-[150px] lg:opacity-100'
                        }`}
                      >
                        {item.name}
                      </span>
                      {!!item.badge && (
                        <NavBadge
                          count={item.badge}
                          className={
                            isCollapsed
                              ? 'absolute right-2 top-0.5'
                              : 'ml-auto mr-3'
                          }
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Account: avatar pinned to the bottom */}
        <div className="relative border-t border-side-line py-3">
          <AccountMenu
            user={user}
            businessName={businessName}
            access={access}
            onLogout={onLogout}
            collapsed={isCollapsed}
          />
        </div>
      </div>
    </aside>
  );
}

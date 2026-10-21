'use client';

import { AccountMenu } from '@/components/layout/AccountMenu';
import { Skeleton } from '@/components/ui';
import { AuthUser } from '@/lib/schemas';
import { AccessStatus } from '@/lib/schemas/auth';
import { Building2, ChevronLeft, LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  name: string;
  /** Shorter label for the phone tab bar. */
  tabLabel?: string;
  href: string;
  icon: LucideIcon;
  /** Other routes that belong to this item, so it stays highlighted there. */
  alsoActiveOn?: string[];
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
      className={`fixed left-0 top-0 z-50 hidden h-full border-r border-primary-300/10 bg-dark-900 transition-all duration-300 lg:block ${
        isCollapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      <div className="flex h-full flex-col">
        {/* Header: logo + collapse button */}
        <div className="flex flex-col">
          <div className="relative flex h-[64px] items-center border-b border-primary-300/10">
            <div className="flex w-20 shrink-0 items-center justify-center">
              <img
                src="/icon.svg"
                alt="reve8"
                className="h-auto w-8 translate-y-0.5"
              />
            </div>
            <div
              className={`relative -ml-3 flex items-center whitespace-nowrap transition-all duration-300 ${
                isCollapsed
                  ? 'lg:max-w-0 lg:opacity-0'
                  : 'lg:max-w-[150px] lg:opacity-100'
              }`}
            >
              {/* Same row as the icon; the label hangs below without shifting the wordmark */}
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-2xl font-extrabold leading-none tracking-tight">
                  <span className="text-[#1573cc]">reve</span>
                  <span className="text-white">8</span>
                </span>
                {showVersion && (
                  <span className="text-[10px] text-dark-400">
                    v{process.env.NEXT_PUBLIC_FRONTEND_VERSION}
                  </span>
                )}
              </div>
              {label && (
                <span className="absolute left-0 top-full text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-dark-400">
                  {label}
                </span>
              )}
            </div>
            <button
              onClick={onCollapse}
              className="absolute -right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-dark-700 bg-dark-800 p-0.5 text-primary-500 transition-colors hover:bg-dark-700 lg:flex"
              aria-label="Toggle sidebar"
            >
              <ChevronLeft
                className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {businessLoading && !businessName && (
            <div className="mx-4 pb-1 pt-4" aria-hidden="true">
              <div className="flex min-h-10 items-center">
                <span className="flex w-12 shrink-0 justify-center">
                  <Skeleton className="h-4 w-4 rounded" />
                </span>
                <Skeleton
                  className={`h-4 w-28 ${isCollapsed ? 'lg:hidden' : ''}`}
                />
              </div>
            </div>
          )}
          {businessName && (
            <div className="pb-1 pt-4" title={businessName}>
              {/* Same mx-4 + w-12 icon column as UserMenu and nav items, so text shares one left edge */}
              <div className="mx-4 flex min-h-10 items-center">
                <span className="flex w-12 shrink-0 items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary-400" />
                </span>
                <div
                  className={`min-w-0 pr-2 transition-all duration-300 ${
                    isCollapsed ? 'lg:hidden' : ''
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-white">
                    {businessName}
                  </p>
                  {access && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-dark-400">
                      <span
                        className={`rounded-full px-1.5 py-0.5 font-semibold uppercase ${
                          access.plan === 'pro'
                            ? 'bg-primary-500/20 text-primary-300'
                            : 'bg-dark-700 text-dark-300'
                        }`}
                      >
                        {access.plan}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mb-2 flex h-6 items-center px-4">
                <div
                  className={`w-full transition-opacity duration-300 ${
                    isCollapsed ? 'hidden opacity-0' : 'block opacity-100'
                  }`}
                >
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-dark-400">
                    {section.title}
                  </p>
                </div>
                <div
                  className={`w-full transition-opacity duration-300 ${
                    isCollapsed ? 'block opacity-100' : 'hidden opacity-0'
                  }`}
                >
                  <div className="mx-auto h-px w-full bg-dark-800" />
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
                      className={`relative mx-4 flex items-center rounded-xl py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-primary-400/10 text-primary-300'
                          : 'text-dark-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="flex w-12 shrink-0 items-center justify-center">
                        <item.icon className="h-5 min-h-[20px] w-5 min-w-[20px]" />
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
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Account: avatar pinned to the bottom */}
        <div className="border-t border-primary-300/10 py-3">
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

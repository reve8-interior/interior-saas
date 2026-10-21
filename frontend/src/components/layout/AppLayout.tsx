'use client';

import { AppSidebar, NavSection } from '@/components/layout/AppSidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { AuthUser } from '@/lib/schemas';
import { AccessStatus } from '@/lib/schemas/auth';
import { ReactNode, useState } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  sections: NavSection[];
  label: string;
  showVersion?: boolean;
  businessName?: string | null;
  businessLoading?: boolean;
  access?: AccessStatus;
  rootHref: string;
  pageTitle: string;
  bgClass: string;
  user: AuthUser | null;
  onLogout: () => void;
}

const SLOT_CLS =
  'flex items-center gap-2 [&>*]:shrink-0 [&>*]:whitespace-nowrap';

export function AppLayout({
  children,
  sections,
  label,
  showVersion,
  businessName,
  businessLoading,
  access,
  rootHref,
  pageTitle,
  bgClass,
  user,
  onLogout,
}: AppLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`min-h-dvh ${bgClass} text-dark-900 dark:text-white`}>
      {/* Phone / small tablet: floating glass pill + menu sheet */}
      <MobileNav
        sections={sections}
        label={label}
        businessName={businessName}
        access={access}
        user={user}
        rootHref={rootHref}
        onLogout={onLogout}
      />

      {/* Desktop: fixed sidebar */}
      <AppSidebar
        sections={sections}
        label={label}
        showVersion={showVersion}
        businessName={businessName}
        businessLoading={businessLoading}
        access={access}
        isCollapsed={isCollapsed}
        rootHref={rootHref}
        onCollapse={() => setIsCollapsed((c) => !c)}
        user={user}
        onLogout={onLogout}
      />

      <div
        className={`transition-all duration-300 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}
      >
        <header className="bg-page sticky top-0 z-30 hidden h-16 items-center justify-between gap-3 px-8 lg:flex">
          <h1 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold text-dark-900 dark:text-white">
            {pageTitle}
          </h1>
          {/* Page actions portal target (desktop) */}
          <div
            data-top-bar-slot
            className={`-my-6 -mr-6 max-w-[70%] overflow-x-auto px-6 py-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${SLOT_CLS}`}
          />
        </header>

        <main className="min-w-0 px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-[calc(env(safe-area-inset-top)+5.25rem)] sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
          {/* Mobile page header: large title + page actions (iOS large-title pattern) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:hidden">
            <h1 className="min-w-0 font-heading text-2xl font-extrabold tracking-tight text-dark-900 dark:text-white">
              {pageTitle}
            </h1>
            <div data-top-bar-slot className={`flex-wrap ${SLOT_CLS}`} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

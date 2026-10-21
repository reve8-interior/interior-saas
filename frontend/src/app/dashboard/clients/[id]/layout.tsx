'use client';

import { FileText, Image, MessagesSquare, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { listDesigns } from '@/lib/designs';
import { listQuotationVersions } from '@/lib/quotationVersions';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';

interface Tab {
  href: string;
  label: string;
  /** Sibling routes that keep this tab highlighted. */
  alsoActiveOn?: string;
  icon: LucideIcon;
  /** Small number shown beside the label, once known. */
  count?: number;
}

/**
 * Workspace shell for one client. The name is in the page title bar; the
 * sections are underlined tabs with counts.
 */
export default function ClientWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  const { data: designs } = useQuery({
    queryKey: ['designs', id],
    queryFn: () => listDesigns(id),
  });
  const { data: versions } = useQuery<QuotationVersionSummary[]>({
    queryKey: ['quotation-versions', id],
    queryFn: () => listQuotationVersions(id),
  });
  const { data: conversations } = useQuery<{ id: string }[]>({
    queryKey: ['checkpoints', id],
    queryFn: () => api.get<{ id: string }[]>(`/clients/${id}/checkpoints`),
  });

  const base = `/dashboard/clients/${id}`;
  const tabs: Tab[] = [
    { href: base, label: 'Details', icon: User },
    {
      href: `${base}/designs`,
      label: 'Designs',
      icon: Image,
      count: designs?.length,
    },
    {
      href: `${base}/checkpoints`,
      label: 'Conversations',
      icon: MessagesSquare,
      count: conversations?.length,
    },
    {
      href: `${base}/quotation`,
      label: 'Quotation',
      icon: FileText,
      alsoActiveOn: `${base}/versions`,
    },
  ];
  const inQuotation =
    pathname === `${base}/quotation` || pathname === `${base}/versions`;

  return (
    <div>
      {/* Pinned under the title bar. lg:-mt-6 cancels main's top padding so the
          resting spot equals the pinned spot. pb-6 is an opaque strip, so content
          scrolls out under it and the gap below the tabs never shrinks. */}
      <div className="bg-page sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-20 -mx-4 pb-6 sm:-mx-6 lg:top-16 lg:-mx-8 lg:-mt-6">
        <div className="border-b border-line px-4 dark:border-primary-300/15 sm:px-6 lg:px-8">
          <nav
            aria-label="Client sections"
            className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map(({ href, label, icon: Icon, count, alsoActiveOn }) => {
              const active = href === pathname || alsoActiveOn === pathname;
              return (
                <Link
                  key={label}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4 ${
                    active
                      ? 'border-primary-500 text-primary-700 dark:border-primary-400 dark:text-white'
                      : 'border-transparent text-dark-600 hover:border-dark-300 hover:text-dark-900 dark:text-dark-300 dark:hover:border-dark-500 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                  {count !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                        active
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200'
                          : 'bg-dark-100 text-dark-600 dark:bg-dark-700 dark:text-dark-300'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {inQuotation && (
        <nav
          aria-label="Quotation views"
          className="mb-4 inline-flex gap-1 rounded-full border border-line bg-white/60 p-1 dark:border-primary-300/15 dark:bg-white/5"
        >
          {[
            { href: `${base}/quotation`, label: 'Current' },
            {
              href: `${base}/versions`,
              label: 'Saved versions',
              count: versions?.length,
            },
          ].map(({ href, label, count }) => (
            <Link
              key={href}
              href={href}
              aria-current={href === pathname ? 'page' : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
                href === pathname
                  ? 'bg-primary-600 text-white'
                  : 'text-dark-600 hover:text-dark-900 dark:text-dark-300 dark:hover:text-white'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="tabular-nums opacity-80">{count}</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}

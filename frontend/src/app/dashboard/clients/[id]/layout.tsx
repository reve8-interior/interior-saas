'use client';

import { FileText, Image, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { countDesigns, designCountKey } from '@/lib/designs';
import { ATTENTION_KEY, getAttention } from '@/lib/attention';
import { reviewQueue, type ReviewableCheckpoint } from '@/lib/checkpoints';
import { getMe } from '@/lib/profile';
import { listQuotationVersions } from '@/lib/quotationVersions';
import { QuotationSections } from '@/components/quotation/QuotationSections';

interface Tab {
  href: string;
  label: string;
  /** Sibling routes that keep this tab highlighted. */
  alsoActiveOn?: string[];
  icon: LucideIcon;
  /** Small number shown beside the label, once known. */
  count?: number;
  /** True while the count is still loading: renders a placeholder pill. */
  countLoading?: boolean;
  /** Items waiting on the designer in this section; shown as a red badge. */
  attention?: number;
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

  const { data: designCount, isLoading: designsLoading } = useQuery({
    queryKey: designCountKey(id),
    queryFn: () => countDesigns(id),
  });
  const { data: meetings = [] } = useQuery<ReviewableCheckpoint[]>({
    queryKey: ['checkpoints', id],
    queryFn: () =>
      api.get<ReviewableCheckpoint[]>(`/clients/${id}/checkpoints`),
  });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });

  const { data: attentionItems = [] } = useQuery({
    queryKey: ATTENTION_KEY,
    queryFn: getAttention,
  });
  // Customer questions live on Details; the rest of the feed belongs to Quotation.
  const clientItems = attentionItems.filter((i) => i.client_id === id);
  const openQuestions = clientItems.filter(
    (i) => i.kind === 'customer_question'
  ).length;
  const waiting =
    clientItems.filter((i) => !i.read && i.kind !== 'customer_question')
      .length + reviewQueue(meetings).length;
  const { data: versions } = useQuery({
    queryKey: ['quotation-versions', id],
    queryFn: () => listQuotationVersions(id),
  });

  const base = `/dashboard/clients/${id}`;
  const quotationPaths = [
    `${base}/quotation`,
    `${base}/checkpoints`,
    `${base}/versions`,
  ];
  const tabs: Tab[] = [
    { href: base, label: 'Details', icon: User, attention: openQuestions },
    {
      href: `${base}/designs`,
      label: 'Designs',
      icon: Image,
      count: designCount,
      countLoading: designsLoading,
    },
    {
      href: `${base}/quotation`,
      label: 'Quotation',
      icon: FileText,
      alsoActiveOn: quotationPaths,
      attention: waiting,
    },
  ];
  return (
    <div>
      {/* Pinned under the title bar. lg:-mt-6 cancels main's top padding so the
          resting spot equals the pinned spot. pb-6 is an opaque strip, so content
          scrolls out under it and the gap below the tabs never shrinks. */}
      <div className="bg-page sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-20 -mx-4 pb-6 sm:-mx-6 lg:top-16 lg:-mx-8 lg:-mt-6">
        <div className="border-b border-line px-4 dark:border-line sm:px-6 lg:px-8">
          <nav
            aria-label="Client sections"
            className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map(
              ({
                href,
                label,
                icon: Icon,
                count,
                countLoading,
                alsoActiveOn,
                attention,
              }) => {
                const active =
                  href === pathname ||
                  alsoActiveOn?.includes(pathname) ||
                  (href !== base && pathname.startsWith(`${href}/`));
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
                    {countLoading && count === undefined && (
                      <Skeleton className="h-5 w-6 rounded-full" />
                    )}
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
                    {attention ? (
                      <span
                        role="status"
                        aria-label={`${attention} waiting on you`}
                        className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white"
                      >
                        {attention}
                      </span>
                    ) : null}
                  </Link>
                );
              }
            )}
          </nav>
        </div>
      </div>

      {quotationPaths.includes(pathname) && (
        <QuotationSections
          base={base}
          pathname={pathname}
          showNotes={!!me?.ai.enabled || meetings.length > 0}
          notesCount={meetings.length}
          versionsCount={versions?.length}
        />
      )}

      {children}
    </div>
  );
}

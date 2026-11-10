'use client';

import { FileText, Image, Lock, Sparkles, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { errorMessage } from '@/lib/errors';
import { deleteSampleClient } from '@/lib/sampleClient';
import type { Client } from '@/lib/schemas/client';
import { countDesigns, designCountKey } from '@/lib/designs';
import { ATTENTION_KEY, getAttention } from '@/lib/attention';
import { INBOX_KEY } from '@/lib/inbox';
import { quotationMessagesKey } from '@/lib/quotationMessages';
import { reviewQueue, type ReviewableCheckpoint } from '@/lib/checkpoints';
import { getMe } from '@/lib/profile';
import { useScrollTabs } from '@/lib/useScrollTabs';
import { listQuotationVersions } from '@/lib/quotationVersions';
import { OpenQuestionStrip } from '@/components/quotation/OpenQuestionStrip';
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
  /** What the badge counts, for screen readers and the hover title. */
  attentionNoun?: string;
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
  const tabsRef = useScrollTabs<HTMLElement>(pathname);
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { data: client } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
  });
  const removeSample = useMutation({
    mutationFn: () => deleteSampleClient(id),
    onSuccess: async () => {
      setConfirmingDelete(false);
      router.push('/dashboard/board');
      qc.removeQueries({ queryKey: ['client', id] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['clients'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-stats'] }),
        // The sample's customer messages must leave the inbox and the bell too.
        qc.invalidateQueries({ queryKey: INBOX_KEY }),
        qc.invalidateQueries({ queryKey: ATTENTION_KEY }),
      ]);
      qc.removeQueries({ queryKey: quotationMessagesKey(id) });
      toast.success('Sample client deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

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
    {
      href: base,
      label: 'Details',
      icon: User,
      attention: openQuestions,
      attentionNoun: openQuestions === 1 ? 'open question' : 'open questions',
    },
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
      attentionNoun: waiting === 1 ? 'item to review' : 'items to review',
    },
  ];
  if (client?.locked) {
    return (
      <div className="surface mx-auto mt-10 max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden />
        <h2 className="mb-2 text-lg font-extrabold tracking-tight">
          {client.name} is locked
        </h2>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Your plan allows fewer clients than you have. Your data is safe.
          Upgrade to open this client again, or archive another client to free a
          spot.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard/billing" className="btn-primary">
            Upgrade to unlock
          </Link>
          <Link href="/dashboard/clients" className="btn-secondary">
            Back to clients
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      {client?.is_sample && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3">
          <Sparkles className="h-5 w-5 shrink-0 text-accent-text" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-text">
            <span className="font-semibold">Sample client.</span> Explore
            freely, then delete it when you&apos;re ready.
          </p>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="btn-danger-soft min-h-11"
          >
            Delete sample
          </button>
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={confirmingDelete}
        isLoading={removeSample.isPending}
        title="Delete sample client"
        description="This removes the sample client and everything you added to it. Your real clients are not affected."
        confirmLabel="Delete sample"
        onConfirm={() => removeSample.mutate()}
        onCancel={() => setConfirmingDelete(false)}
      />
      {/* Pinned under the title bar. lg:-mt-6 cancels main's top padding so the
          resting spot equals the pinned spot. pb-6 is an opaque strip, so content
          scrolls out under it and the gap below the tabs never shrinks. */}
      <div className="bg-page sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-20 -mx-4 pb-6 sm:-mx-6 lg:top-16 lg:-mx-8 lg:-mt-6">
        <div className="border-b border-line px-4 dark:border-line sm:px-6 lg:px-8">
          <nav
            ref={tabsRef}
            aria-label="Client sections"
            className="scroll-tabs -mb-px flex gap-1"
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
                attentionNoun,
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
                        className={`badge font-medium tabular-nums ${
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
                        aria-label={`${attention} ${attentionNoun ?? 'waiting on you'}`}
                        title={`${attention} ${attentionNoun ?? 'waiting on you'}`}
                        className="rounded-control bg-red-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white"
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

      {/* Version pages already carry the reply banner. */}
      {pathname === `${base}/quotation` && <OpenQuestionStrip clientId={id} />}
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

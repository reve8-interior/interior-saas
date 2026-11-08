'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  CheckCircle2,
  MessageCircleQuestion,
  RotateCcw,
  ThumbsUp,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ReplyActions } from '@/components/quotation/ReplyActions';
import { ListSkeleton } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ATTENTION_KEY } from '@/lib/attention';
import { timeAgo } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import {
  INBOX_FILTER_LABELS,
  INBOX_KEY,
  getInbox,
  groupByClient,
  inboxClientHref,
  matchesInboxFilter,
  type InboxFilter,
  type InboxMessage,
  type InboxThread,
} from '@/lib/inbox';
import {
  isOpenQuestion,
  quotationMessagesKey,
  resolveQuotationMessage,
} from '@/lib/quotationMessages';

/** Customer conversations from shared quotation links: customers on the left, the chosen thread on the right. */
export default function InboxPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const selectedId = useSearchParams().get('client');
  const [filter, setFilter] = useState<InboxFilter>('open');
  const [newestFirst, setNewestFirst] = useState(true);
  const {
    data: messages = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<InboxMessage[]>({ queryKey: INBOX_KEY, queryFn: getInbox });

  const resolve = useMutation({
    mutationFn: ({ ids, resolved }: { ids: string[]; resolved: boolean }) =>
      Promise.all(ids.map((id) => resolveQuotationMessage(id, resolved))),
    onSuccess: (_, { ids }) => {
      const clientIds = new Set(
        messages.filter((m) => ids.includes(m.id)).map((m) => m.client_id)
      );
      qc.invalidateQueries({ queryKey: INBOX_KEY });
      qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      clientIds.forEach((c) =>
        qc.invalidateQueries({ queryKey: quotationMessagesKey(c) })
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const threads = useMemo(() => groupByClient(messages), [messages]);
  // The list follows the filter; the open thread always shows the whole conversation.
  const listed = threads.filter(
    (t) =>
      t.client_id === selectedId ||
      t.messages.some((m) => matchesInboxFilter(m, filter))
  );
  const active =
    threads.find((t) => t.client_id === selectedId) ?? listed[0] ?? null;
  // Phones show one pane at a time: the thread only once a customer is picked.
  const threadChosen = selectedId !== null && active !== null;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <ListSkeleton rows={4} rowClassName="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load your inbox.
        </ErrorState>
      ) : messages.length === 0 ? (
        <EmptyState>
          No customer messages yet. Questions and approvals sent from a shared
          quotation link will show up here.
        </EmptyState>
      ) : (
        <div className="surface grid min-h-[28rem] overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
          <aside
            aria-label="Customers"
            className={`flex-col border-line md:flex md:border-r ${
              threadChosen ? 'hidden' : 'flex'
            }`}
          >
            <div
              role="group"
              aria-label="Filter messages"
              className="flex flex-wrap gap-2 border-b border-line p-3"
            >
              {(Object.keys(INBOX_FILTER_LABELS) as InboxFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className="filter-chip"
                >
                  {INBOX_FILTER_LABELS[f]}
                  <span className="ml-1.5 tabular-nums opacity-70">
                    {
                      threads.filter((t) =>
                        t.messages.some((m) => matchesInboxFilter(m, f))
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            {listed.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-y-auto">
                {listed.map((t) => (
                  <li key={t.client_id}>
                    <CustomerRow
                      thread={t}
                      active={t.client_id === active?.client_id}
                      onSelect={() =>
                        router.replace(inboxClientHref(t.client_id))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section
            aria-label="Conversation"
            className={`min-w-0 flex-col md:flex ${
              threadChosen ? 'flex' : 'hidden'
            }`}
          >
            {active ? (
              <Thread
                thread={active}
                busy={resolve.isPending}
                newestFirst={newestFirst}
                onToggleSort={() => setNewestFirst((v) => !v)}
                onBack={() => router.replace('/dashboard/inbox')}
                onResolve={(ids, resolved) => resolve.mutate({ ids, resolved })}
              />
            ) : (
              <p className="p-6 text-sm text-muted">
                Pick a customer to see their messages.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function CustomerRow({
  thread: t,
  active,
  onSelect,
}: {
  thread: InboxThread;
  active: boolean;
  onSelect: () => void;
}) {
  const preview =
    t.latest.message ||
    (t.latest.kind === 'approved' ? 'Approved the quotation' : '');
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-text/[0.04] ${
        active ? 'bg-brand/10' : ''
      }`}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold uppercase text-accent-text"
      >
        {t.client_name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-text">
            {t.client_name}
          </span>
          <time
            dateTime={t.latest.created_at}
            className="shrink-0 text-xs text-muted"
          >
            {timeAgo(t.latest.created_at)}
          </time>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-muted">{preview}</span>
          {t.openCount > 0 && (
            <span
              aria-label={`${t.openCount} open`}
              className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
            >
              {t.openCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Thread({
  thread: t,
  busy,
  newestFirst,
  onToggleSort,
  onBack,
  onResolve,
}: {
  thread: InboxThread;
  busy: boolean;
  newestFirst: boolean;
  onToggleSort: () => void;
  onBack: () => void;
  onResolve: (ids: string[], resolved: boolean) => void;
}) {
  const open = t.messages.filter(isOpenQuestion);
  const ordered = newestFirst ? [...t.messages].reverse() : t.messages;
  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to customers"
          className="btn-secondary btn-sm md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <Link
          href={`/dashboard/clients/${t.client_id}`}
          className="font-heading text-base font-semibold text-text hover:text-brand"
        >
          {t.client_name}
        </Link>
        <button
          type="button"
          onClick={onToggleSort}
          aria-label={
            newestFirst
              ? 'Newest first. Switch to oldest first'
              : 'Oldest first. Switch to newest first'
          }
          title={newestFirst ? 'Newest first' : 'Oldest first'}
          className="btn-secondary btn-sm ml-auto"
        >
          {newestFirst ? (
            <ArrowDownWideNarrow className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowUpNarrowWide className="h-4 w-4" aria-hidden />
          )}
          {newestFirst ? 'Newest' : 'Oldest'}
        </button>
        {open.length > 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onResolve(
                open.map((m) => m.id),
                true
              )
            }
            className="btn-secondary btn-sm"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Mark all resolved
          </button>
        )}
      </header>
      <ul className="flex-1 space-y-3 overflow-y-auto p-4">
        {ordered.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            busy={busy}
            onToggle={(resolved) => onResolve([m.id], resolved)}
          />
        ))}
      </ul>
    </>
  );
}

function MessageBubble({
  message: m,
  busy,
  onToggle,
}: {
  message: InboxMessage;
  busy: boolean;
  onToggle: (resolved: boolean) => void;
}) {
  const asked = m.kind === 'question';
  const open = isOpenQuestion(m);
  const Icon = !asked ? ThumbsUp : open ? MessageCircleQuestion : CheckCircle2;
  const versionHref = m.version_id
    ? `/dashboard/clients/${m.client_id}/versions?view=1&version=${m.version_id}`
    : `/dashboard/clients/${m.client_id}`;
  return (
    <li
      className={`flex max-w-prose flex-wrap items-start justify-between gap-2 rounded-xl border p-3 ${
        open
          ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
          : 'border-line opacity-80'
      }`}
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Icon
            className={`h-4 w-4 shrink-0 ${
              open ? 'text-red-600' : 'text-green-600 dark:text-green-400'
            }`}
            aria-hidden
          />
          <span className="font-semibold text-text">{m.name}</span>
          <Link
            href={versionHref}
            className="rounded-control border border-line px-2 py-0.5 text-xs font-semibold text-accent-text hover:bg-text/5"
          >
            v{m.version_number}
          </Link>
          <time dateTime={m.created_at} className="text-xs text-muted">
            {timeAgo(m.created_at)}
          </time>
        </p>
        {m.item_label && (
          <p className="mt-1 text-xs font-medium text-accent-text">
            About: {m.item_label}
          </p>
        )}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-dark-700 dark:text-dark-200">
          {m.message || (asked ? '' : 'Approved the quotation')}
        </p>
        {asked && !open && (
          <p className="mt-1 text-xs text-muted">
            Resolved
            {m.resolved_by_name ? ` by ${m.resolved_by_name}` : ''}
            {m.resolved_at ? ` · ${timeAgo(m.resolved_at)}` : ''}
          </p>
        )}
      </div>
      {/* Icons sit beside the text; they drop below it only on a very narrow screen. */}
      <div className="flex shrink-0 items-center gap-2">
        {open && (
          <ReplyActions
            clientId={m.client_id}
            versionId={m.version_id}
            versionNumber={m.version_number}
            contact={m.client_contact}
            showVersionLink={false}
            itemLabel={m.item_label}
          />
        )}
        {asked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggle(open)}
            aria-label={open ? 'Mark resolved' : 'Reopen'}
            title={open ? 'Mark resolved' : 'Reopen'}
            className="btn-secondary btn-sm px-2.5"
          >
            {open ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>
    </li>
  );
}

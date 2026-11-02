'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircleQuestion, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
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
  matchesInboxFilter,
  type InboxFilter,
  type InboxMessage,
} from '@/lib/inbox';
import {
  isOpenQuestion,
  quotationMessagesKey,
  resolveQuotationMessage,
} from '@/lib/quotationMessages';

/** Everything customers sent from shared quotation links, across all clients. */
export default function InboxPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>('open');
  const {
    data: messages = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<InboxMessage[]>({ queryKey: INBOX_KEY, queryFn: getInbox });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const resolve = useMutation({
    mutationFn: ({ ids, resolved }: { ids: string[]; resolved: boolean }) =>
      Promise.all(ids.map((id) => resolveQuotationMessage(id, resolved))),
    onSuccess: (_, { ids }) => {
      const clientIds = new Set(
        messages.filter((m) => ids.includes(m.id)).map((m) => m.client_id)
      );
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: INBOX_KEY });
      qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      clientIds.forEach((c) =>
        qc.invalidateQueries({ queryKey: quotationMessagesKey(c) })
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const shown = messages.filter((m) => matchesInboxFilter(m, filter));
  // Only questions can be resolved; approvals are informational.
  const selectable = useMemo(
    () => shown.filter((m) => m.kind === 'question'),
    [shown]
  );
  const chosen = selectable.filter((m) => selected.has(m.id));
  const openChosen = chosen.filter(isOpenQuestion);
  const resolvedChosen = chosen.filter((m) => !isOpenQuestion(m));
  const allSelected =
    selectable.length > 0 && chosen.length === selectable.length;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((m) => m.id)));
  const run = (list: InboxMessage[], resolved: boolean) =>
    resolve.mutate({ ids: list.map((m) => m.id), resolved });

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Filter messages"
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(INBOX_FILTER_LABELS) as InboxFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setSelected(new Set());
            }}
            className="filter-chip"
          >
            {INBOX_FILTER_LABELS[f]}
            <span className="ml-1.5 tabular-nums opacity-70">
              {messages.filter((m) => matchesInboxFilter(m, f)).length}
            </span>
          </button>
        ))}
      </div>

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
      ) : shown.length === 0 ? (
        <EmptyState>You&apos;re all caught up.</EmptyState>
      ) : (
        <>
          {selectable.length > 0 && (
            <div className="surface sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-10 flex min-h-control flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 lg:top-16">
              <label className="flex min-h-control cursor-pointer items-center gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate = chosen.length > 0 && !allSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all questions"
                />
                {chosen.length > 0 ? `${chosen.length} selected` : 'Select all'}
              </label>
              {openChosen.length > 0 && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() => run(openChosen, true)}
                  className="btn-secondary btn-sm"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Mark resolved
                </button>
              )}
              {resolvedChosen.length > 0 && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() => run(resolvedChosen, false)}
                  className="btn-secondary btn-sm"
                >
                  Reopen
                </button>
              )}
            </div>
          )}
          <ul className="surface divide-y divide-line overflow-hidden">
            {shown.map((m) => (
              <MessageCard
                key={m.id}
                message={m}
                checked={selected.has(m.id)}
                onCheck={() => toggleOne(m.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MessageCard({
  message: m,
  checked,
  onCheck,
}: {
  message: InboxMessage;
  checked: boolean;
  onCheck: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const asked = m.kind === 'question';
  const open = isOpenQuestion(m);
  const Icon = !asked ? ThumbsUp : open ? MessageCircleQuestion : CheckCircle2;
  const clientHref = `/dashboard/clients/${m.client_id}`;
  const versionHref = m.version_id
    ? `${clientHref}/versions?view=1&version=${m.version_id}`
    : clientHref;
  // Approvals have no reply to send, so only questions get the action row.
  const text = m.message || (asked ? '' : 'Approved the quotation');
  return (
    <li
      className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-text/[0.03] ${
        open ? '' : 'opacity-70'
      } ${checked ? 'bg-brand/5' : ''}`}
      aria-label={`${m.client_name}: ${asked ? 'question' : 'approval'}`}
    >
      {asked ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={`Select question from ${m.client_name}`}
          className="mt-0.5"
        />
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <Icon
        className={`mt-1 h-4 w-4 shrink-0 ${
          open ? 'text-red-600' : 'text-green-600 dark:text-green-400'
        }`}
        aria-hidden
      />
      {/* Phone: sender + time on line one, message below. md+: sender | message | time on one line. */}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 md:grid-cols-[18rem_minmax(0,1fr)_auto]">
        <p className="min-w-0 truncate text-sm">
          <Link
            href={clientHref}
            className="font-semibold text-text hover:text-brand"
          >
            {m.client_name}
          </Link>
          <span className="text-muted">
            {' · '}
            {m.name}
            {asked && !open ? ' · Resolved' : ''}
          </span>
        </p>
        <div className="col-span-2 row-start-2 flex min-w-0 items-baseline gap-2 text-sm text-dark-700 dark:text-dark-200 md:col-span-1 md:col-start-2 md:row-start-1">
          <Link
            href={versionHref}
            className="shrink-0 rounded-control border border-line px-2 py-0.5 text-xs font-semibold text-accent-text hover:bg-text/5"
          >
            v{m.version_number}
          </Link>
          {/* Collapsed to one line like an email preview; tap to read the whole message. */}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className={`min-w-0 flex-1 text-left ${
              expanded ? 'whitespace-pre-wrap break-words' : 'truncate'
            }`}
          >
            {text}
          </button>
        </div>
        <time
          dateTime={m.created_at}
          className="col-start-2 row-start-1 whitespace-nowrap text-xs text-muted md:col-start-3"
        >
          {timeAgo(m.created_at)}
        </time>
        {open && (
          <div className="col-span-2 row-start-3 mt-1.5 md:col-span-1 md:col-start-2">
            <ReplyActions
              clientId={m.client_id}
              versionId={m.version_id}
              versionNumber={m.version_number}
              contact={m.client_contact}
              showVersionLink={false}
            />
          </div>
        )}
      </div>
    </li>
  );
}

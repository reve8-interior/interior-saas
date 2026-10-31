'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui';
import { SharedLinkCard } from '@/components/shared/SharedLinkCard';
import {
  FILTER_LABELS,
  SHARED_LINKS_KEY,
  listSharedLinks,
  matchesFilter,
  type LinkFilter,
  type SharedLink,
} from '@/lib/sharedLinks';

/** Every public link in one place: who has it, whether it works, what came back. */
export default function SharedLinksPage() {
  const [filter, setFilter] = useState<LinkFilter>('all');
  // ?client=<id> (from a client's quick links) narrows the list to one client.
  const [clientId, setClientId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('client')
  );
  const {
    data: links = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<SharedLink[]>({
    queryKey: SHARED_LINKS_KEY,
    queryFn: listSharedLinks,
  });

  const scoped = clientId
    ? links.filter((l) => l.client_id === clientId)
    : links;
  const clientName = scoped[0]?.client_name ?? null;
  const shown = scoped.filter((l) => matchesFilter(l, filter));

  return (
    <div className="space-y-4">
      {clientId && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
          Showing links for <strong>{clientName ?? 'this client'}</strong>
          <button
            type="button"
            onClick={() => {
              setClientId(null);
              window.history.replaceState(null, '', '/dashboard/shared');
            }}
            className="link-action inline-flex items-center"
          >
            Show all links
          </button>
        </p>
      )}
      <div
        role="group"
        aria-label="Filter links"
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(FILTER_LABELS) as LinkFilter[]).map((f) => {
          const count = scoped.filter((l) => matchesFilter(l, f)).length;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="filter-chip"
            >
              {FILTER_LABELS[f]}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} rowClassName="h-24" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load shared links.
        </ErrorState>
      ) : scoped.length === 0 ? (
        <EmptyState>
          Nothing shared yet. Links you create for designs, quotations or your
          portfolio will be listed here.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>No links match this filter.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.map((link) => (
            <SharedLinkCard key={`${link.kind}-${link.id}`} link={link} />
          ))}
        </ul>
      )}
    </div>
  );
}

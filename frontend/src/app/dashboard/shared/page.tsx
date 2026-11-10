'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui';
import { SharedLinkCard } from '@/components/shared/SharedLinkCard';
import {
  FILTER_LABELS,
  SHARED_LINKS_KEY,
  groupByClient,
  listSharedLinks,
  matchesFilter,
  type LinkFilter,
  type SharedLink,
} from '@/lib/sharedLinks';

/** Every public link in one place: who has it, whether it works, what came back. */
export default function SharedLinksPage() {
  const [filter, setFilter] = useState<LinkFilter>('all');
  const [search, setSearch] = useState('');
  const [byCustomer, setByCustomer] = useState(true);
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
  const q = search.trim().toLowerCase();
  const shown = scoped.filter(
    (l) =>
      matchesFilter(l, filter) &&
      (!q || `${l.client_name ?? ''} ${l.title}`.toLowerCase().includes(q))
  );
  const groups = groupByClient(shown);
  // A long list of customers starts collapsed so it can be scanned.
  const openGroups = groups.length <= 5 || q !== '';

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 dark:text-dark-400"
            aria-hidden
          />
          <input
            className="field !pl-9"
            placeholder="Search customer or link"
            aria-label="Search customer or link"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div role="tablist" aria-label="Group links" className="seg shrink-0">
          {[
            { on: true, label: 'By customer' },
            { on: false, label: 'All links' },
          ].map((v) => (
            <button
              key={v.label}
              role="tab"
              aria-selected={byCustomer === v.on}
              onClick={() => setByCustomer(v.on)}
              className="seg-btn whitespace-nowrap"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
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
      ) : byCustomer ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <details
              key={`${g.key}-${openGroups}`}
              open={openGroups}
              className="surface group p-4"
            >
              <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
                <span className="font-semibold">{g.name}</span>
                <span className="text-xs tabular-nums text-dark-500 dark:text-dark-400">
                  {g.links.length} {g.links.length === 1 ? 'link' : 'links'}
                  {g.links.some((l) => l.response_kind) && ' · has replies'}
                </span>
              </summary>
              <ul className="mt-3 space-y-3">
                {g.links.map((link) => (
                  <SharedLinkCard
                    key={`${link.kind}-${link.id}`}
                    link={link}
                    showClient={false}
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>
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

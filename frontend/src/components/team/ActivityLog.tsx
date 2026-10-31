'use client';

import { TeamApi } from '@/lib/team';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/format';
import { BTN_CLS, MUTED } from './teamStyles';
import { describeAudit } from '@/lib/teamAudit';

const PAGE_SIZE = 20;

export function ActivityLog({ api }: { api: TeamApi }) {
  const [page, setPage] = useState(0);
  const [scope, setScope] = useState<'' | 'team'>('');
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...api.key, 'audit', page, scope],
    queryFn: () =>
      api.audit({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action: scope || undefined,
      }),
    placeholderData: (prev) => prev,
  });
  const total = data?.total ?? 0;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${MUTED}`}>
          Who did what in this business, newest first.
        </p>
        <select
          className="field !w-auto"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as '' | 'team');
            setPage(0);
          }}
          aria-label="Filter activity"
        >
          <option value="">All activity</option>
          <option value="team">Team changes only</option>
        </select>
      </div>
      <ul className="surface divide-y divide-line dark:divide-line">
        {isLoading && (
          <li className={`px-4 py-4 text-center ${MUTED}`}>Loading…</li>
        )}
        {!isLoading && data?.items.length === 0 && (
          <li className={`px-4 py-6 text-center ${MUTED}`}>No activity yet.</li>
        )}
        {data?.items.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <p className="text-sm">{describeAudit(e)}</p>
            <p className={`text-xs ${MUTED}`}>
              {e.actor_name || e.actor_email || 'System'} ·{' '}
              {fmtDateTime(e.timestamp)}
            </p>
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className={BTN_CLS}
            disabled={page === 0 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Newer
          </button>
          <span className={`text-xs ${MUTED}`}>
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            className={BTN_CLS}
            disabled={page + 1 >= pages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Older
          </button>
        </div>
      )}
    </div>
  );
}

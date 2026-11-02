'use client';

import { ErrorState, ListSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import {
  CONVERSATION_FILTER_LABELS,
  checkpointNumbers,
  compareCheckpoints,
  matchesConversationFilter,
  matchesConversationQuery,
  type ConversationFilter,
} from '@/lib/checkpoints';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkpoint, LineItemData } from '@/components/checkpoints/types';
import { AddFromNotes } from '@/components/checkpoints/AddFromNotes';
import { CheckpointCard } from '@/components/checkpoints/CheckpointCard';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckpointsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [query, setQuery] = useState('');

  const {
    data: checkpoints = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Checkpoint[]>({
    queryKey: ['checkpoints', id],
    queryFn: () => api.get<Checkpoint[]>(`/clients/${id}/checkpoints`),
  });

  // Newest first; ordering is microsecond-safe (ISO string compare with
  // id tiebreak) and matches the backend's (created_at, id) ordering.
  const sorted = [...checkpoints].sort((a, b) => compareCheckpoints(b, a));

  const visible = sorted.filter(
    (cp) =>
      matchesConversationFilter(cp, filter) &&
      matchesConversationQuery(cp, query)
  );

  // Chronological numbering: #1 = oldest checkpoint.
  const numbers = checkpointNumbers(checkpoints);

  // Ids present when the modal saved; the first id not in it is the new card.
  const knownIds = useRef<Set<string> | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!knownIds.current) return;
    const fresh = checkpoints.find((c) => !knownIds.current!.has(c.id));
    if (!fresh) return;
    knownIds.current = null;
    setHighlightId(fresh.id);
    document
      .getElementById(`checkpoint-${fresh.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [checkpoints]);

  // Arriving from a quotation row's "From conversation" link (#checkpoint-ID).
  useEffect(() => {
    const target = window.location.hash.replace(/^#checkpoint-/, '');
    if (!target || !checkpoints.some((c) => c.id === target)) return;
    setHighlightId(target);
    document
      .getElementById(`checkpoint-${target}`)
      ?.scrollIntoView({ block: 'center' });
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [checkpoints.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAiSaved() {
    knownIds.current = new Set(checkpoints.map((c) => c.id));
    qc.invalidateQueries({ queryKey: ['checkpoints', id] });
    toast.success(
      'Notes saved — review the rows below, tick the correct ones, then add them to the quotation'
    );
  }

  function handleQuotationUpdated() {
    qc.invalidateQueries({ queryKey: ['checkpoints', id] });
    qc.invalidateQueries({ queryKey: ['quotation', id] });
  }

  return (
    <div className="space-y-6">
      <TopBarActions>
        <AddFromNotes
          clientId={id}
          onSaved={handleAiSaved}
          className="btn-primary"
        />
      </TopBarActions>

      {sorted.length > 1 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meeting notes…"
          aria-label="Search meeting notes"
          className="field max-w-md"
        />
      )}
      {sorted.length > 1 && (
        <div
          role="group"
          aria-label="Filter meeting notes"
          className="flex flex-wrap gap-2"
        >
          {(
            Object.keys(CONVERSATION_FILTER_LABELS) as ConversationFilter[]
          ).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="filter-chip"
            >
              {CONVERSATION_FILTER_LABELS[f]}
              <span className="ml-1.5 tabular-nums opacity-70">
                {sorted.filter((cp) => matchesConversationFilter(cp, f)).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={3} rowClassName="h-24" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load this client&apos;s meeting notes.
        </ErrorState>
      ) : sorted.length === 0 ? (
        <EmptyState
          action={
            <AddFromNotes
              clientId={id}
              onSaved={handleAiSaved}
              className="btn-primary"
            />
          }
        >
          No meeting notes yet. Upload or paste meeting notes or a WhatsApp chat
          and the rows are drafted for you.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>No meeting notes match.</EmptyState>
      ) : (
        <div className="relative space-y-4 md:ml-4 md:border-l-2 md:border-line md:dark:border-line">
          {visible.map((cp) => (
            <div
              key={cp.id}
              id={`checkpoint-${cp.id}`}
              className={`relative rounded-2xl transition-shadow md:pl-6 ${
                highlightId === cp.id ? 'ring-2 ring-primary-500' : ''
              }`}
            >
              <div
                aria-hidden
                className={`absolute -left-[7px] top-5 hidden h-3 w-3 rounded-full border-2 md:block ${
                  cp.added_to_quotation
                    ? 'border-brand bg-brand'
                    : 'border-line bg-white dark:border-line dark:bg-dark-900/60'
                }`}
              />
              <CheckpointCard
                cp={cp}
                number={numbers[cp.id] ?? 0}
                clientId={id}
                onQuotationUpdated={handleQuotationUpdated}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

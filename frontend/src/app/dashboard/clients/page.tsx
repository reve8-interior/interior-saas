'use client';

import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useEffect, useState } from 'react';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { PHASE_LABELS, PHASE_ORDER } from '@/lib/constants';
import {
  CLIENT_SORT_LABELS,
  COLUMN_SORTS,
  buildClientQuery,
  filterSortClients,
  nextColumnSort,
  parseClientParams,
  type ClientListParams,
  type ClientSort,
} from '@/lib/clientsList';
import type { Client } from '@/lib/schemas/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  RotateCcw,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { NewClientModal } from '@/components/crm/NewClientModal';
import { ClientsViewSwitch } from '@/components/crm/ClientsViewSwitch';

function BudgetBadge({ budget }: { budget?: string }) {
  return budget ? (
    <span className="badge bg-primary-100/70 capitalize text-dark-700 dark:bg-white/10 dark:text-dark-200">
      {budget}
    </span>
  ) : (
    <span className="text-dark-400">—</span>
  );
}

function PhaseSelect({
  client,
  onChange,
}: {
  client: Client;
  onChange: (phase: string) => void;
}) {
  return (
    <select
      value={client.current_phase}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Phase of ${client.name}`}
      className="field !w-auto !py-1.5"
    >
      {PHASE_ORDER.map((phase) => (
        <option key={phase} value={phase}>
          {PHASE_LABELS[phase] ?? phase}
        </option>
      ))}
    </select>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const params = parseClientParams(searchParams);
  const showInactive = params.tab === 'inactive';
  const tab = params.tab;
  const needle = params.q.trim();
  const qc = useQueryClient();
  const [showNewClient, setShowNewClient] = useState(false);
  const [search, setSearch] = useState(params.q);

  /** Merge a patch into the URL so list state survives reload and sharing. */
  function updateParams(patch: Partial<ClientListParams>) {
    const qs = buildClientQuery({ ...params, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounce typing into the URL; also follows back/forward navigation.
  useEffect(() => {
    if (search === params.q) return;
    const t = setTimeout(() => updateParams({ q: search }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    setSearch(params.q);
  }, [params.q]);

  // "n" opens New Client unless the user is typing.
  useEffect(() => {
    if (showInactive) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key !== 'n') return;
      if (
        el.closest('input, textarea, select, [contenteditable], [role=dialog]')
      )
        return;
      e.preventDefault();
      setShowNewClient(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showInactive]);

  const {
    data: allClients = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Client[]>({
    queryKey: ['clients', showInactive],
    queryFn: () =>
      api.get<Client[]>(`/clients${showInactive ? '?show_inactive=true' : ''}`),
  });
  const clients = filterSortClients(allClients, params);
  const hasFilters = Boolean(needle || params.phase);
  const clearFilters = () => {
    setSearch('');
    updateParams({ q: '', phase: '' });
  };
  const totalCount = allClients.length;

  const activateMutation = useMutation({
    mutationFn: (clientId: string) =>
      api.patch(`/clients/${clientId}/activate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client reactivated');
    },
    onError: () => toast.error('Failed to reactivate client'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (client: Client) =>
      api.patch(`/clients/${client.id}/deactivate`, {}),
    onSuccess: (_data, client) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${client.name} deactivated`, {
        action: {
          label: 'Undo',
          onClick: () => activateMutation.mutate(client.id),
        },
      });
    },
    onError: () => toast.error('Failed to deactivate client'),
  });

  const phaseMutation = useMutation({
    mutationFn: ({
      clientId,
      phase,
    }: {
      clientId: string;
      phase: string;
      previous?: string;
    }) => api.put(`/clients/${clientId}/phase`, { phase }),
    onSuccess: (_data, { clientId, phase, previous }) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      toast.success(`Moved to ${PHASE_LABELS[phase] ?? phase}`, {
        action: previous
          ? {
              label: 'Undo',
              onClick: () =>
                phaseMutation.mutate({ clientId, phase: previous }),
            }
          : undefined,
      });
    },
    onError: () => toast.error('Could not change the phase'),
  });

  const setPhase = (client: Client) => (phase: string) =>
    phaseMutation.mutate({
      clientId: client.id,
      phase,
      previous: client.current_phase,
    });

  function switchTab(t: ClientListParams['tab']) {
    updateParams({ tab: t });
  }

  const sortHeader = (column: keyof typeof COLUMN_SORTS, label: string) => {
    const active = (COLUMN_SORTS[column] as readonly ClientSort[]).includes(
      params.sort
    );
    const descending = params.sort === COLUMN_SORTS[column][1];
    const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
    return (
      <th
        className="px-4 py-3"
        aria-sort={!active ? 'none' : descending ? 'descending' : 'ascending'}
      >
        <button
          type="button"
          onClick={() =>
            updateParams({ sort: nextColumnSort(column, params.sort) })
          }
          className="inline-flex min-h-11 items-center gap-1 font-semibold uppercase"
        >
          {label}
          <Icon
            className={`h-3.5 w-3.5 ${active ? '' : 'opacity-40'}`}
            aria-hidden
          />
        </button>
      </th>
    );
  };

  const emptyState = hasFilters ? (
    <EmptyState
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    >
      No clients match your filters.
    </EmptyState>
  ) : showInactive ? (
    <EmptyState>No deactivated clients.</EmptyState>
  ) : (
    <EmptyState
      action={
        <Button size="sm" onClick={() => setShowNewClient(true)}>
          + Add your first client
        </Button>
      }
    >
      No clients yet.
    </EmptyState>
  );

  return (
    <div className="space-y-6">
      <TopBarActions>
        <div className="flex items-center gap-2">
          <ClientsViewSwitch active="list" />
          {!showInactive && (
            <button
              onClick={() => setShowNewClient(true)}
              className="btn-primary"
            >
              + New Client
            </button>
          )}
        </div>
      </TopBarActions>

      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="inline-flex gap-1 rounded-control border border-line bg-surface p-1 dark:border-line dark:bg-white/5">
          {(
            [
              ['active', 'Active Clients'],
              ['inactive', 'Deactivated'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              aria-pressed={tab === t}
              className={`rounded-control px-5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? 'bg-brand text-white'
                  : 'text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email"
            aria-label="Search clients"
            className="field !pl-9"
          />
        </div>
        <select
          value={params.phase}
          onChange={(e) => updateParams({ phase: e.target.value })}
          aria-label="Filter by phase"
          className="field !w-auto"
        >
          <option value="">All phases</option>
          {PHASE_ORDER.map((phase) => (
            <option key={phase} value={phase}>
              {PHASE_LABELS[phase] ?? phase}
            </option>
          ))}
        </select>
        <select
          value={params.sort}
          onChange={(e) => updateParams({ sort: e.target.value as ClientSort })}
          aria-label="Sort clients"
          className="field !w-auto"
        >
          {(Object.keys(CLIENT_SORT_LABELS) as ClientSort[]).map((key) => (
            <option key={key} value={key}>
              {CLIENT_SORT_LABELS[key]}
            </option>
          ))}
        </select>
        {!isLoading && !isError && (
          <p
            className="text-sm text-dark-500 dark:text-dark-400"
            aria-live="polite"
          >
            {hasFilters
              ? `${clients.length} of ${totalCount}`
              : `${totalCount} ${totalCount === 1 ? 'client' : 'clients'}`}
          </p>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} className="space-y-2" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()}>
          Couldn&apos;t load your clients.
        </ErrorState>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {clients.map((client) => {
              const summary = (
                <>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-dark-900 dark:text-white">
                      {client.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-dark-500 dark:text-dark-400">
                      {client.contact_info?.phone ||
                        client.contact_info?.email ||
                        (client.updated_at
                          ? new Date(client.updated_at).toLocaleDateString()
                          : '—')}
                    </p>
                  </div>
                  {!showInactive && (
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-dark-400"
                      aria-hidden
                    />
                  )}
                </>
              );
              return (
                <div key={client.id} className="surface overflow-hidden">
                  {showInactive ? (
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      {summary}
                    </div>
                  ) : (
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                    >
                      {summary}
                    </Link>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2 dark:border-line">
                    <label className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400">
                      Phase
                      {showInactive ? (
                        <span className="font-medium text-dark-700 dark:text-dark-200">
                          {PHASE_LABELS[client.current_phase] ??
                            client.current_phase}
                        </span>
                      ) : (
                        <PhaseSelect
                          client={client}
                          onChange={setPhase(client)}
                        />
                      )}
                    </label>
                    <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400">
                      Budget
                      <BudgetBadge budget={client.contact_info?.budget} />
                    </div>
                    {showInactive ? (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => activateMutation.mutate(client.id)}
                        isLoading={activateMutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="danger-subtle"
                        size="sm"
                        onClick={() => deactivateMutation.mutate(client)}
                        isLoading={deactivateMutation.isPending}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {clients.length === 0 && emptyState}
          </div>

          {/* Desktop: table */}
          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="table-head text-left">
                <tr>
                  {sortHeader('name', 'Name')}
                  {sortHeader('phase', 'Phase')}
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Contact</th>
                  {sortHeader('updated', 'Updated')}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-line">
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className={`${showInactive ? '' : 'cursor-pointer'} hover:bg-primary-50/70 dark:hover:bg-white/[0.06]`}
                    onClick={() =>
                      !showInactive &&
                      router.push(`/dashboard/clients/${client.id}`)
                    }
                  >
                    <td className="px-4 py-3">
                      {showInactive ? (
                        <span className="font-medium text-dark-900 dark:text-white">
                          {client.name}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/clients/${client.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-dark-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                        >
                          {client.name}
                        </Link>
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showInactive ? (
                        <span className="text-dark-700 dark:text-dark-200">
                          {PHASE_LABELS[client.current_phase] ??
                            client.current_phase}
                        </span>
                      ) : (
                        <PhaseSelect
                          client={client}
                          onChange={setPhase(client)}
                        />
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <BudgetBadge budget={client.contact_info?.budget} />
                    </td>
                    <td className="px-4 py-3 text-dark-600 dark:text-dark-300">
                      {client.contact_info?.phone ||
                        client.contact_info?.email ||
                        '—'}
                    </td>
                    <td className="px-4 py-3 text-dark-500 dark:text-dark-400">
                      {client.updated_at
                        ? new Date(client.updated_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showInactive ? (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => activateMutation.mutate(client.id)}
                          isLoading={activateMutation.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          variant="danger-subtle"
                          size="sm"
                          onClick={() => deactivateMutation.mutate(client)}
                          isLoading={deactivateMutation.isPending}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4">
                      {emptyState}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['clients'] })}
        />
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { TopBarActions } from '@/components/layout/TopBarActions';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { PHASE_LABELS, PHASE_ORDER } from '@/lib/constants';
import type { Client } from '@/lib/schemas/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const tab = searchParams.get('tab') ?? 'active';
  const showInactive = tab === 'inactive';
  const qc = useQueryClient();
  const [showNewClient, setShowNewClient] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Client | null>(null);

  const [search, setSearch] = useState('');

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

  const { data: allClients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', showInactive],
    queryFn: () =>
      api.get<Client[]>(`/clients${showInactive ? '?show_inactive=true' : ''}`),
  });
  const needle = search.trim().toLowerCase();
  // Most recently touched first, so stale clients sink instead of new ones.
  const sortedClients = [...allClients].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );
  const clients = needle
    ? sortedClients.filter((c) =>
        [c.name, c.contact_info?.phone, c.contact_info?.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : sortedClients;

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
    mutationFn: (clientId: string) =>
      api.patch(`/clients/${clientId}/deactivate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deactivated');
      setDeactivateTarget(null);
    },
    onError: () => toast.error('Failed to deactivate client'),
  });

  const phaseMutation = useMutation({
    mutationFn: ({ clientId, phase }: { clientId: string; phase: string }) =>
      api.put(`/clients/${clientId}/phase`, { phase }),
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      toast.success('Phase updated');
    },
    onError: () => toast.error('Could not change the phase'),
  });

  const setPhase = (client: Client) => (phase: string) =>
    phaseMutation.mutate({ clientId: client.id, phase });

  function switchTab(t: string) {
    const params = new URLSearchParams();
    params.set('tab', t);
    router.replace(`/dashboard/clients?${params.toString()}`, {
      scroll: false,
    });
  }

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
        <div className="inline-flex gap-1 rounded-full border border-line bg-white/60 p-1 dark:border-primary-300/15 dark:bg-white/5">
          {(
            [
              ['active', 'Active Clients'],
              ['inactive', 'Deactivated'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`rounded-full px-5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-brand'
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
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded-2xl bg-primary-100/70 dark:bg-white/10"
            />
          ))}
        </div>
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

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2 dark:border-primary-300/15">
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
                        onClick={() => setDeactivateTarget(client)}
                        isLoading={deactivateMutation.isPending}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {clients.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
                {needle ? (
                  'No clients match your search.'
                ) : showInactive ? (
                  'No deactivated clients.'
                ) : (
                  <>
                    No clients yet.{' '}
                    <button
                      onClick={() => setShowNewClient(true)}
                      className="text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Add one
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="table-head text-left">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phase</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-primary-300/10">
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
                          onClick={() => setDeactivateTarget(client)}
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
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-dark-500 dark:text-dark-400"
                    >
                      {needle ? (
                        'No clients match your search.'
                      ) : showInactive ? (
                        'No deactivated clients.'
                      ) : (
                        <>
                          No clients yet.{' '}
                          <button
                            onClick={() => setShowNewClient(true)}
                            className="text-primary-600 hover:underline dark:text-primary-400"
                          >
                            Add one
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDeleteModal
        isOpen={!!deactivateTarget}
        isLoading={deactivateMutation.isPending}
        title="Deactivate Client"
        description={`Deactivate ${deactivateTarget?.name}? They will be moved to the inactive list and can be reactivated anytime.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id);
        }}
        onCancel={() => setDeactivateTarget(null)}
      />

      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['clients'] })}
        />
      )}
    </div>
  );
}

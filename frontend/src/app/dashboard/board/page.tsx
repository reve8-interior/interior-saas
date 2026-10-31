'use client';

import { ErrorState, LoadingRegion, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import {
  UNASSIGNED_FILTER,
  daysSince,
  filterBoardClients,
  formatAge,
} from '@/lib/board';
import {
  PHASES,
  PHASE_LABELS,
  PHASE_COLORS,
  PHASE_ORDER,
} from '@/lib/constants';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  type Announcements,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClientsViewSwitch } from '@/components/crm/ClientsViewSwitch';
import { NewClientModal } from '@/components/crm/NewClientModal';
import { RowMenu } from '@/components/ui/RowMenu';
import { TopBarActions } from '@/components/layout/TopBarActions';

import type { Client } from '@/lib/schemas/client';

function ClientCardBody({
  client,
  dragging = false,
}: {
  client: Client;
  dragging?: boolean;
}) {
  const designer =
    client.assigned_designer?.full_name || client.assigned_designer?.email;
  return (
    <div
      className={`client-card flex min-h-[68px] items-center gap-3 !p-3 ${
        dragging ? 'rotate-1 !border-primary-400' : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold uppercase text-white">
        {client.name.trim().charAt(0) || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dark-900 dark:text-white">
          {client.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-dark-500 dark:text-dark-400">
          {designer ?? 'Unassigned'}
          {client.contact_info?.phone ? ` · ${client.contact_info.phone}` : ''}
        </p>
      </div>
      <span className="shrink-0 pr-[4.75rem] text-xs tabular-nums text-dark-500 dark:text-dark-400">
        {formatAge(daysSince(client.updated_at))}
      </span>
    </div>
  );
}

function DraggableClient({
  client,
  onMove,
}: {
  client: Client;
  onMove: (client: Client, phase: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: client.id,
  });

  return (
    <div className={`relative ${isDragging ? 'opacity-40' : ''}`}>
      <Link
        href={`/dashboard/clients/${client.id}`}
        draggable={false}
        className="board-card-in block select-none rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <ClientCardBody client={client} />
      </Link>
      {/* Non-drag way to change phase: works with keyboard, screen readers and long scrolls. */}
      <div className="absolute right-11 top-[34px] -translate-y-1/2">
        <RowMenu
          compact
          label={`Move ${client.name} to another phase`}
          items={PHASES.filter((p) => p !== client.current_phase).map((p) => ({
            label: `Move to ${PHASE_LABELS[p]}`,
            onSelect: () => onMove(client, p),
          }))}
        />
      </div>
      {/* Dedicated handle: the card stays a plain link; keyboard and touch users get a labelled drag target. */}
      <button
        type="button"
        ref={setNodeRef}
        aria-label={`Drag ${client.name}. Press space to pick up, arrow keys to move, space to drop.`}
        className="absolute right-1 top-[34px] flex h-9 w-9 -translate-y-1/2 touch-none items-center justify-center rounded-xl text-dark-400 hover:text-dark-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-dark-500"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

function PhaseColumn({
  phase,
  clients,
  hasFilter,
  onMove,
}: {
  phase: string;
  clients: Client[];
  hasFilter: boolean;
  onMove: (client: Client, phase: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${PHASE_LABELS[phase]} column`}
      className={`flex w-full flex-col rounded-2xl border bg-surface transition-colors dark:bg-dark-900/40 lg:w-auto lg:min-w-52 lg:max-w-none lg:!flex-1 ${
        isOver
          ? 'border-primary-500 bg-primary-50/80 dark:border-primary-400 dark:bg-primary-500/10'
          : 'border-line dark:border-line'
      }`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${PHASE_COLORS[phase]}`}
        >
          {PHASE_LABELS[phase]}
        </span>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums text-dark-700 ring-1 ring-inset ring-line dark:bg-dark-800 dark:text-dark-200 dark:ring-dark-700">
          {clients.length}
        </span>
      </div>
      <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto p-3 lg:max-h-[calc(100dvh-18rem)]">
        {clients.map((client) => (
          <DraggableClient key={client.id} client={client} onMove={onMove} />
        ))}
        {clients.length === 0 && (
          <div className="rounded-2xl border border-dashed border-dark-300 p-4 text-center text-xs text-dark-500 dark:border-line">
            {hasFilter ? 'No matches' : 'Drop a client here'}
          </div>
        )}
      </div>
    </section>
  );
}

export default function BoardPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [query, setQuery] = useState('');
  const [designer, setDesigner] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);

  // URL-backed filters (q, designer) without needing a Suspense boundary.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQuery(p.get('q') ?? '');
    setDesigner(p.get('designer') ?? '');
    setFiltersReady(true);
  }, []);
  useEffect(() => {
    if (!filtersReady) return;
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (designer) p.set('designer', designer);
    const qs = p.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname
    );
  }, [query, designer, filtersReady]);

  const {
    data: clients = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/clients'),
  });

  const movePhase = useMutation({
    mutationFn: ({
      id,
      phase,
    }: {
      id: string;
      phase: string;
      previous?: string;
    }) => api.put(`/clients/${id}/phase`, { phase }),
    onMutate: async ({ id, phase }) => {
      await qc.cancelQueries({ queryKey: ['clients'] });
      const previous = qc.getQueryData<Client[]>(['clients']);
      qc.setQueryData<Client[]>(['clients'], (old = []) =>
        old.map((c) => (c.id === id ? { ...c, current_phase: phase } : c))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['clients'], ctx.previous);
      toast.error('Could not move client');
    },
    onSuccess: (_data, { id, phase, previous }) =>
      toast.success(`Moved to ${PHASE_LABELS[phase]}`, {
        action: previous
          ? {
              label: 'Undo',
              onClick: () => movePhase.mutate({ id, phase: previous }),
            }
          : undefined,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });

  // Mouse drags after 6px; touch needs a short press so the carousel still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const client = clients.find((c) => c.id === active.id);
    const phase = String(over.id);
    if (!client || client.current_phase === phase) return;
    movePhase.mutate({
      id: client.id,
      phase,
      previous: client.current_phase,
    });
  };

  const moveTo = (client: Client, phase: string) => {
    if (client.current_phase === phase) return;
    movePhase.mutate({ id: client.id, phase, previous: client.current_phase });
  };

  const onDragCancel = () => {
    setActiveId(null);
  };

  const hasFilter = query.trim() !== '' || designer !== '';
  const visible = useMemo(
    () => filterBoardClients(clients, query, designer),
    [clients, query, designer]
  );
  const designers = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients)
      if (c.assigned_designer_id && c.assigned_designer)
        map.set(
          c.assigned_designer_id,
          c.assigned_designer.full_name || c.assigned_designer.email
        );
    return [...map.entries()];
  }, [clients]);
  const byPhase = PHASE_ORDER.reduce<Record<string, Client[]>>((acc, phase) => {
    acc[phase] = visible.filter((c) => c.current_phase === phase);
    return acc;
  }, {});
  const nameOf = (id: string | number) =>
    clients.find((c) => c.id === id)?.name ?? 'client';
  const phaseOf = (id: string | number) => PHASE_LABELS[String(id)] ?? 'column';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is over ${phaseOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped in ${phaseOf(over.id)}.`
        : `${nameOf(active.id)} dropped outside a column.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} cancelled.`,
  };
  const activeClient = clients.find((c) => c.id === activeId) ?? null;

  if (isError) {
    return (
      <ErrorState onRetry={() => refetch()}>
        Couldn&apos;t load the board.
      </ErrorState>
    );
  }

  if (isLoading) {
    return (
      <LoadingRegion label="Loading board" className="flex gap-3">
        {PHASES.map((phase) => (
          <Skeleton key={phase} className="h-64 flex-1 rounded-2xl" />
        ))}
      </LoadingRegion>
    );
  }

  return (
    <div className="space-y-4">
      <TopBarActions>
        <div className="flex items-center gap-2">
          <ClientsViewSwitch active="board" />
          <button
            onClick={() => setShowNewClient(true)}
            className="btn-primary"
          >
            + New Client
          </button>
        </div>
      </TopBarActions>
      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['clients'] })}
        />
      )}
      <p className="text-sm text-dark-500 dark:text-dark-400">
        {hasFilter
          ? `${visible.length} of ${clients.length} clients`
          : `${clients.length} total clients`}{' '}
        ·{' '}
        <span className="lg:hidden">
          use the handle on a card, or “Move to”
        </span>
        <span className="hidden lg:inline">
          drag a card by its handle, or use “Move to” under it
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone or email"
            aria-label="Search board"
            className="field !pl-9"
          />
        </div>
        <select
          value={designer}
          onChange={(e) => setDesigner(e.target.value)}
          aria-label="Filter by designer"
          className="field min-h-control !w-auto"
        >
          <option value="">All designers</option>
          <option value={UNASSIGNED_FILTER}>Unassigned</option>
          {designers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setDesigner('');
            }}
            className="btn-secondary"
          >
            Clear
          </button>
        )}
      </div>

      <DndContext
        accessibility={{ announcements }}
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex flex-col items-stretch gap-3 pb-3 lg:flex-row lg:overflow-x-auto">
          {PHASES.map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              clients={byPhase[phase]}
              hasFilter={hasFilter}
              onMove={moveTo}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeClient ? (
            <ClientCardBody client={activeClient} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

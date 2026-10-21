'use client';

import { LoadingRegion, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
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
import { GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClientsViewSwitch } from '@/components/crm/ClientsViewSwitch';
import { NewClientModal } from '@/components/crm/NewClientModal';
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
        dragging ? 'rotate-1 !border-primary-400 shadow-brand' : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-sm font-bold uppercase text-white">
        {client.name.trim().charAt(0) || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dark-900 dark:text-white">
          {client.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-dark-500 dark:text-dark-400">
          {designer ?? 'Unassigned'}
        </p>
      </div>
      <GripVertical
        aria-hidden
        className="h-4 w-4 shrink-0 text-dark-400 dark:text-dark-500"
      />
    </div>
  );
}

function DraggableClient({
  client,
  suppressClick,
}: {
  client: Client;
  suppressClick: React.RefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: client.id,
  });

  return (
    <Link
      ref={setNodeRef}
      href={`/dashboard/clients/${client.id}`}
      draggable={false}
      onClick={(e) => {
        if (suppressClick.current) e.preventDefault();
      }}
      className={`board-card-in block touch-manipulation select-none rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        isDragging ? 'opacity-40' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <ClientCardBody client={client} />
    </Link>
  );
}

function PhaseColumn({
  phase,
  clients,
  suppressClick,
}: {
  phase: string;
  clients: Client[];
  suppressClick: React.RefObject<boolean>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${PHASE_LABELS[phase]} column`}
      className={`flex w-[82%] max-w-80 flex-col rounded-2xl border bg-white/50 transition-colors dark:bg-dark-900/40 sm:w-72 lg:w-auto lg:min-w-52 lg:max-w-none lg:!flex-1 ${
        isOver
          ? 'border-primary-500 bg-primary-50/80 dark:border-primary-400 dark:bg-primary-500/10'
          : 'border-line dark:border-primary-300/15'
      }`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-primary-300/15">
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
          <DraggableClient
            key={client.id}
            client={client}
            suppressClick={suppressClick}
          />
        ))}
        {clients.length === 0 && (
          <div className="rounded-2xl border border-dashed border-dark-300 p-4 text-center text-xs text-dark-500 dark:border-primary-300/15">
            Drop a client here
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
  const suppressClick = useRef(false);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
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
    suppressClick.current = true;
    setActiveId(String(active.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    // Let the click that follows pointer-up pass before re-enabling links.
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
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

  const onDragCancel = () => {
    setActiveId(null);
    suppressClick.current = false;
  };

  const byPhase = PHASE_ORDER.reduce<Record<string, Client[]>>((acc, phase) => {
    acc[phase] = clients.filter((c) => c.current_phase === phase);
    return acc;
  }, {});
  const activeClient = clients.find((c) => c.id === activeId) ?? null;

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
        {clients.length} total clients ·{' '}
        <span className="lg:hidden">press and hold a card to move it</span>
        <span className="hidden lg:inline">
          drag a card to change its phase
        </span>
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="snap-strip -mx-4 scroll-px-4 items-stretch px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0">
          {PHASES.map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              clients={byPhase[phase]}
              suppressClick={suppressClick}
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

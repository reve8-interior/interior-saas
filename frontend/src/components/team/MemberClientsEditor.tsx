'use client';

import { ApiError, api } from '@/lib/api';
import { getMemberClients, setMemberClients } from '@/lib/clientAccess';
import type { Client } from '@/lib/schemas/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** Pick which clients a designer can see (besides ones they lead). */
export function MemberClientsEditor({
  userId,
  onDone,
}: {
  userId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'active'],
    queryFn: () => api.get<Client[]>('/clients'),
  });
  const { data: access } = useQuery({
    queryKey: ['member-clients', userId],
    queryFn: () => getMemberClients(userId),
  });

  useEffect(() => {
    if (access) setSelected(new Set(access.shared_ids));
  }, [access]);

  const save = useMutation({
    mutationFn: () => setMemberClients(userId, [...selected]),
    onSuccess: () => {
      toast.success('Client access updated');
      queryClient.invalidateQueries({ queryKey: ['member-clients', userId] });
      queryClient.invalidateQueries({ queryKey: ['team'] });
      onDone();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Something went wrong'
      ),
  });

  const lead = new Set(access?.lead_ids ?? []);
  const shown = clients.filter((c) =>
    c.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-3 w-full space-y-2 rounded-xl border border-line p-3 dark:border-primary-300/15">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">
          Clients this designer can see ({lead.size + selected.size})
        </p>
        <input
          className="field !w-40"
          placeholder="Search clients"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto dark:divide-primary-300/10">
        {shown.length === 0 && (
          <li className="py-3 text-center text-xs text-dark-500 dark:text-dark-400">
            No clients found.
          </li>
        )}
        {shown.map((c) => {
          const isLead = lead.has(c.id);
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={isLead || selected.has(c.id)}
                  disabled={isLead}
                  onChange={() => toggle(c.id)}
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {isLead && (
                  <span className="text-xs text-dark-500 dark:text-dark-400">
                    Lead
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </div>
  );
}

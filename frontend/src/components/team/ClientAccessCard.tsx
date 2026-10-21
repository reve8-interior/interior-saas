'use client';

import { errorMessage } from '@/lib/errors';
import { getClientAccess, setClientAccess } from '@/lib/clientAccess';
import { ownTeamApi } from '@/lib/team';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const MUTED = 'text-dark-500 dark:text-dark-400';

/**
 * Admin-only: which designers can work on this client. Admins and viewers
 * always see every client, so only designers are listed. The designer who
 * owns the client (its lead) always keeps access and is shown locked.
 */
export function ClientAccessCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<Set<string>>(new Set());

  const { data: team } = useQuery({
    queryKey: [...ownTeamApi.key, 'overview'],
    queryFn: () => ownTeamApi.overview(),
  });
  const { data: access } = useQuery({
    queryKey: ['client-access', clientId],
    queryFn: () => getClientAccess(clientId),
  });

  const lead = access?.lead_id ?? '';

  useEffect(() => {
    if (access) {
      setMembers(new Set(access.member_ids));
    }
  }, [access]);

  // Save only lights up once the ticked set differs from what is stored.
  const saved = new Set(access?.member_ids ?? []);
  const dirty =
    members.size !== saved.size || [...members].some((id) => !saved.has(id));

  const save = useMutation({
    mutationFn: () =>
      setClientAccess(
        clientId,
        [...members].filter((id) => id !== lead)
      ),
    onSuccess: () => {
      toast.success('Access updated');
      queryClient.invalidateQueries({ queryKey: ['client-access', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const designers = (team?.members ?? []).filter(
    (m) => m.is_active && m.role === 'designer'
  );
  const label = (m: { full_name: string | null; email: string }) =>
    m.full_name || m.email;

  function toggle(id: string) {
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="surface p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
          Team access
        </p>
        <p className={`mt-1 text-xs ${MUTED}`}>
          Admins always have access. Tick the designers who can work on this
          client.
        </p>
      </div>
      {designers.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>No designers on the team yet.</p>
      ) : (
        <ul className="divide-y divide-line dark:divide-primary-300/10">
          {designers.map((d) => {
            const isLead = d.id === lead;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isLead || members.has(d.id)}
                    disabled={isLead}
                    onChange={() => toggle(d.id)}
                  />
                  <span className="truncate">{label(d)}</span>
                </label>
                {isLead && <span className={`text-xs ${MUTED}`}>Owner</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </div>
  );
}

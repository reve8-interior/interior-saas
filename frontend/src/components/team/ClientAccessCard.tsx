'use client';

import { errorMessage } from '@/lib/errors';
import { getClientAccess, setClientAccess } from '@/lib/clientAccess';
import { ownTeamApi } from '@/lib/team';
import { Modal } from '@/components/ui/Modal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const MUTED = 'text-dark-500 dark:text-dark-400';
/** Above this many designers the picker gets a search box. */
const SEARCH_FROM = 6;

interface Designer {
  id: string;
  full_name: string | null;
  email: string;
}
const nameOf = (m: Designer) => m.full_name || m.email;

function Avatar({ member }: { member: Designer }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase text-white"
    >
      {nameOf(member).trim().charAt(0) || '?'}
    </span>
  );
}

/**
 * Admin-only: which designers can work on this client. Admins and viewers
 * always see every client, so only designers are listed. The designer who
 * owns the client (its lead) always keeps access and is shown locked.
 *
 * The card lists who has access today; the choosing happens in a popup with
 * search, so a team of any size stays manageable.
 */
export function ClientAccessCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const { data: team } = useQuery({
    queryKey: [...ownTeamApi.key, 'overview'],
    queryFn: () => ownTeamApi.overview(),
  });
  const { data: access } = useQuery({
    queryKey: ['client-access', clientId],
    queryFn: () => getClientAccess(clientId),
  });

  const lead = access?.lead_id ?? '';
  const saved = new Set(access?.member_ids ?? []);
  const designers: Designer[] = (team?.members ?? []).filter(
    (m) => m.is_active && m.role === 'designer'
  );
  const withAccess = designers.filter((d) => d.id === lead || saved.has(d.id));

  const dirty =
    picked.size !== saved.size || [...picked].some((id) => !saved.has(id));

  const save = useMutation({
    mutationFn: () =>
      setClientAccess(
        clientId,
        [...picked].filter((id) => id !== lead)
      ),
    onSuccess: () => {
      toast.success('Access updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['client-access', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const open = () => {
    setPicked(new Set(saved));
    setQuery('');
    setEditing(true);
  };
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const shown = designers.filter(
    (d) =>
      !q ||
      nameOf(d).toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q)
  );
  const selectable = shown.filter((d) => d.id !== lead);
  const allShownPicked =
    selectable.length > 0 && selectable.every((d) => picked.has(d.id));
  const setShown = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const d of selectable) {
        if (on) next.add(d.id);
        else next.delete(d.id);
      }
      return next;
    });
  const selectedCount = picked.size + (lead && !picked.has(lead) ? 1 : 0);

  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="type-label">Team access</p>
          <p className={`mt-1 text-xs ${MUTED}`}>
            Admins always have access. Choose which designers can also work on
            this client.
          </p>
        </div>
        {designers.length > 0 && (
          <button
            type="button"
            onClick={open}
            className="btn-secondary btn-sm shrink-0"
          >
            Manage
          </button>
        )}
      </div>

      {designers.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>No designers on the team yet.</p>
      ) : (
        <>
          <p className={`mb-2 text-xs tabular-nums ${MUTED}`}>
            {withAccess.length} of {designers.length} designer
            {designers.length === 1 ? '' : 's'} can access this client
          </p>
          <ul className="flex flex-wrap gap-2">
            {withAccess.map((d) => (
              <li
                key={d.id}
                className="flex max-w-full items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm"
              >
                <Avatar member={d} />
                <span className="truncate">{nameOf(d)}</span>
                {d.id === lead && (
                  <span className={`text-xs ${MUTED}`}>Owner</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Team access"
        description="Pick the designers who can work on this client."
        maxWidth="md"
      >
        <div className="space-y-3">
          {designers.length >= SEARCH_FROM && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search designers"
                aria-label="Search designers"
                className="field !pl-9"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs tabular-nums ${MUTED}`} aria-live="polite">
              {selectedCount} of {designers.length} selected
            </p>
            {selectable.length > 1 && (
              <button
                type="button"
                className="link-action"
                onClick={() => setShown(!allShownPicked)}
              >
                {allShownPicked ? 'Clear' : q ? 'Select shown' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line max-sm:max-h-none">
            {shown.map((d) => {
              const isLead = d.id === lead;
              return (
                <li key={d.id}>
                  <label
                    className={`flex min-h-11 items-center gap-3 px-3 py-2 ${
                      isLead ? '' : 'cursor-pointer hover:bg-text/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isLead || picked.has(d.id)}
                      disabled={isLead}
                      onChange={() => toggle(d.id)}
                    />
                    <Avatar member={d} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {nameOf(d)}
                      </span>
                      {d.full_name && (
                        <span className={`block truncate text-xs ${MUTED}`}>
                          {d.email}
                        </span>
                      )}
                    </span>
                    {isLead && (
                      <span className={`text-xs ${MUTED}`}>Owner</span>
                    )}
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className={`px-3 py-4 text-center text-sm ${MUTED}`}>
                No designers match &ldquo;{query}&rdquo;.
              </li>
            )}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
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
      </Modal>
    </div>
  );
}

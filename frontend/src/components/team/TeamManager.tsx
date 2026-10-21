'use client';

import { ApiError } from '@/lib/api';
import { AuditEntry, BusinessUser, TeamRole } from '@/lib/schemas/business';
import { MemberClientsEditor } from '@/components/team/MemberClientsEditor';
import { TeamApi } from '@/lib/team';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  FolderKey,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { fmtDateTime } from '@/lib/format';

const BTN_CLS =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-dark-700 hover:bg-primary-50/70 disabled:opacity-50 dark:border-primary-300/15 dark:text-dark-300 dark:hover:bg-white/[0.06]';
const MUTED = 'text-dark-500 dark:text-dark-400';
const PAGE_SIZE = 20;

const ROLE_INFO: Record<TeamRole, { label: string; blurb: string }> = {
  admin: {
    label: 'Admin',
    blurb: 'Manages the team, all clients and the material library.',
  },
  designer: {
    label: 'Designer',
    blurb: 'Works on the clients assigned to them.',
  },
  viewer: {
    label: 'Viewer',
    blurb: 'Read-only access to everything in the business.',
  },
};

const ROLES = Object.keys(ROLE_INFO) as TeamRole[];

interface MemberForm {
  email: string;
  full_name: string;
  password: string;
  role: TeamRole;
}

const EMPTY_FORM: MemberForm = {
  email: '',
  full_name: '',
  password: '',
  role: 'designer',
};

function errorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error
    ? err.message
    : 'Something went wrong';
}

/** One readable line per audit event. */
export function describeAudit(e: AuditEntry): string {
  const p = e.payload as Record<string, unknown>;
  const who = typeof p.email === 'string' ? p.email : 'a member';
  switch (e.action) {
    case 'team.member_added':
      return `Added ${who} as ${String(p.role)}`;
    case 'team.member_removed':
      return `Removed ${who}${
        Number(p.clients_reassigned) > 0
          ? ` (${String(p.clients_reassigned)} clients reassigned)`
          : ''
      }`;
    case 'team.password_reset':
      return `Reset password for ${who}`;
    case 'team.member_updated': {
      const changes = (p.changes ?? {}) as Record<
        string,
        { from: unknown; to: unknown }
      >;
      const parts = Object.entries(changes).map(([field, c]) =>
        field === 'is_active'
          ? c.to
            ? 'enabled'
            : 'disabled'
          : `${field} ${String(c.from)} → ${String(c.to)}`
      );
      return `Updated ${who}: ${parts.join(', ') || 'no changes'}`;
    }
    case 'access.client_updated':
      return `Changed who can see client ${String(p.client)} (+${String(p.granted)} / -${String(p.revoked)})`;
    case 'access.member_updated':
      return `Changed client access for ${who} (+${String(p.granted)} / -${String(p.revoked)})`;
    case 'auth.login':
      return 'Signed in';
    case 'auth.password_changed':
      return 'Changed their password';
    case 'business.created':
      return 'Business created';
    case 'business.updated': {
      const fields = Object.keys((p.changes ?? {}) as object);
      return `Business settings changed: ${fields.join(', ')}`;
    }
    case 'business.activated':
      return 'Business activated';
    case 'business.deactivated':
      return 'Business deactivated';
    default:
      return e.action;
  }
}

function SeatMeter({ used, max }: { used: number; max: number | null }) {
  const pct = max ? Math.min((used / max) * 100, 100) : 0;
  const full = max !== null && used >= max;
  return (
    <div className="surface space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Team seats
        </p>
        <p className="text-sm font-bold">
          {used} / {max ?? '∞'}
        </p>
      </div>
      {max !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-dark-100 dark:bg-white/10">
          <div
            className={`h-full rounded-full ${full ? 'bg-amber-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className={`text-xs ${MUTED}`}>
        {full
          ? 'Seat limit reached. Disable a member or contact your platform administrator for more seats.'
          : 'Only active members use a seat.'}
      </p>
    </div>
  );
}

function ActivityLog({ api }: { api: TeamApi }) {
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
      <ul className="surface divide-y divide-line dark:divide-primary-300/10">
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

interface Props {
  api: TeamApi;
  /** Signed-in user's id: their own row can't be demoted, disabled or removed. */
  selfId?: string | null;
  /** Show per-designer client access (business admins only). */
  manageClientAccess?: boolean;
}

/** Members, roles, seat usage and activity for one business's team. */
export function TeamManager({
  api,
  selfId = null,
  manageClientAccess = false,
}: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'members' | 'activity'>('members');
  const [editing, setEditing] = useState<BusinessUser | 'new' | null>(null);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const overviewKey = [...api.key, 'overview'];
  const { data, isLoading } = useQuery({
    queryKey: overviewKey,
    queryFn: () => api.overview(),
  });
  const members = data?.members ?? [];
  const seatsFull = data?.seats_left === 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: api.key });
    queryClient.invalidateQueries({ queryKey: ['businesses'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const full_name = form.full_name.trim() || null;
      if (editing === 'new') {
        return api.add({
          email: form.email.trim(),
          password: form.password,
          full_name,
          role: form.role,
        });
      }
      return api.update((editing as BusinessUser).id, {
        email: form.email.trim(),
        full_name,
        role: form.role,
      });
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Member added' : 'Member updated');
      setEditing(null);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (u: BusinessUser) =>
      api.update(u.id, { is_active: !u.is_active }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: (u: BusinessUser) =>
      api.resetPassword(u.id).then((r) => ({
        email: u.email,
        password: r.temporary_password,
      })),
    onSuccess: (result) => {
      setIssued(result);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (u: BusinessUser) => api.remove(u.id),
    onSuccess: () => {
      toast.success('Member removed');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }

  function openEdit(u: BusinessUser) {
    setForm({
      email: u.email,
      full_name: u.full_name ?? '',
      password: '',
      role: u.role,
    });
    setEditing(u);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (editing === 'new' && form.password.length < 8) {
      toast.error('Temporary password must be at least 8 characters');
      return;
    }
    saveMutation.mutate();
  }

  function confirmReset(u: BusinessUser) {
    if (
      window.confirm(
        `Reset the password for ${u.email}? Their current password stops working.`
      )
    ) {
      resetMutation.mutate(u);
    }
  }

  function confirmRemove(u: BusinessUser) {
    if (
      window.confirm(
        `Remove ${u.email}? Their login is deleted and their clients are reassigned to you. This cannot be undone. (Use Disable to keep the account.)`
      )
    ) {
      removeMutation.mutate(u);
    }
  }

  const tabBtn = (id: 'members' | 'activity', label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        tab === id
          ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300'
          : 'text-dark-600 hover:bg-white/60 dark:text-dark-300 dark:hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2">
        {tabBtn('members', `Members (${members.length})`)}
        {tabBtn('activity', 'Activity')}
      </div>

      {tab === 'activity' ? (
        <ActivityLog api={api} />
      ) : (
        <>
          {data && <SeatMeter used={data.seats_used} max={data.max_users} />}

          {issued && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="mb-2">
                Temporary password for <strong>{issued.email}</strong> — shown
                once. They must change it on first login.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 font-mono dark:bg-dark-900/60">
                  {issued.password}
                </code>
                <button
                  type="button"
                  className={BTN_CLS}
                  onClick={() => {
                    navigator.clipboard
                      .writeText(issued.password)
                      .then(() => toast.success('Copied'))
                      .catch(() => toast.error('Copy failed'));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <form onSubmit={onSubmit} className="surface space-y-3 p-4">
              <h3 className="text-sm font-extrabold tracking-tight">
                {editing === 'new' ? 'Add team member' : 'Edit team member'}
              </h3>
              <div>
                <label className="field-label">Login email *</label>
                <input
                  type="email"
                  className="field"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">Name</label>
                <input
                  className="field"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  maxLength={255}
                />
              </div>
              <div>
                <label className="field-label">Role</label>
                <select
                  className="field"
                  value={form.role}
                  disabled={editing !== 'new' && editing.id === selfId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role: e.target.value as TeamRole }))
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_INFO[r].label}
                    </option>
                  ))}
                </select>
                <p className={`mt-1 text-xs ${MUTED}`}>
                  {ROLE_INFO[form.role].blurb}
                </p>
              </div>
              {editing === 'new' && (
                <div>
                  <label className="field-label">
                    Temporary password * (min 8 chars)
                  </label>
                  <input
                    type="password"
                    className="field"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    autoComplete="new-password"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm ${MUTED}`}>
                  People who can sign in to this business.
                </p>
                <button
                  type="button"
                  onClick={openNew}
                  className="btn-primary"
                  disabled={seatsFull}
                  title={seatsFull ? 'Seat limit reached' : undefined}
                >
                  <Plus className="h-4 w-4" /> Add member
                </button>
              </div>
              <ul className="surface divide-y divide-line dark:divide-primary-300/10">
                {isLoading && (
                  <li className={`px-4 py-4 text-center ${MUTED}`}>Loading…</li>
                )}
                {members.map((u) => {
                  const isSelf = u.id === selfId;
                  return (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {u.full_name || u.email}
                          {isSelf && (
                            <span className={`ml-2 text-xs ${MUTED}`}>
                              (you)
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${MUTED}`}>
                          {u.full_name && `${u.email} · `}
                          {ROLE_INFO[u.role]?.label ?? u.role}
                          {!u.is_active && ' · disabled'}
                          {u.must_change_password && ' · temp password'}
                          {' · '}
                          {u.last_login_at
                            ? `last seen ${fmtDateTime(u.last_login_at)}`
                            : 'never signed in'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {manageClientAccess && u.role === 'designer' && (
                          <button
                            type="button"
                            className={BTN_CLS}
                            onClick={() =>
                              setAccessFor(accessFor === u.id ? null : u.id)
                            }
                          >
                            <FolderKey className="h-3.5 w-3.5" /> Clients
                          </button>
                        )}
                        <button
                          type="button"
                          className={BTN_CLS}
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              className={BTN_CLS}
                              onClick={() => confirmReset(u)}
                              disabled={resetMutation.isPending}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Reset
                              password
                            </button>
                            <button
                              type="button"
                              className={BTN_CLS}
                              onClick={() => toggleMutation.mutate(u)}
                              disabled={toggleMutation.isPending}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {u.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              className={`${BTN_CLS} !text-red-600 dark:!text-red-400`}
                              onClick={() => confirmRemove(u)}
                              disabled={removeMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </>
                        )}
                      </div>
                      {accessFor === u.id && (
                        <MemberClientsEditor
                          userId={u.id}
                          onDone={() => setAccessFor(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { BusinessUser, TeamRole } from '@/lib/schemas/business';
import { MemberClientsEditor } from '@/components/team/MemberClientsEditor';
import { TeamApi } from '@/lib/team';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Dices,
  Eye,
  EyeOff,
  FolderKey,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { fmtDateTime } from '@/lib/format';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Modal } from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui';
import { RowMenu } from '@/components/ui/RowMenu';
import {
  MIN_PASSWORD_LENGTH,
  generateTempPassword,
  validateMemberForm,
  type MemberFormErrors,
} from '@/lib/teamForm';
import { MUTED } from './teamStyles';
import { SeatMeter } from './SeatMeter';
import { ActivityLog } from './ActivityLog';

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
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    kind: 'reset' | 'remove';
    member: BusinessUser;
  } | null>(null);
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
      if (editing === 'new') {
        setIssued({ email: form.email.trim(), password: form.password });
      }
      setEditing(null);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (u: BusinessUser) =>
      api.update(u.id, { is_active: !u.is_active }),
    onSuccess: (_, u) => {
      toast.success(
        u.is_active ? `Disabled ${u.email}` : `Enabled ${u.email}`,
        {
          action: {
            label: 'Undo',
            onClick: () =>
              api
                .update(u.id, { is_active: u.is_active })
                .then(refresh)
                .catch((err) => toast.error(errorMessage(err))),
          },
        }
      );
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: (u: BusinessUser) =>
      api.resetPassword(u.id).then((r) => ({
        email: u.email,
        password: r.temporary_password,
      })),
    onSuccess: (result) => {
      setPendingAction(null);
      setIssued(result);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (u: BusinessUser) => api.remove(u.id),
    onSuccess: () => {
      setPendingAction(null);
      toast.success('Member removed');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setErrors({});
    setShowPassword(false);
    setEditing('new');
  }

  function openEdit(u: BusinessUser) {
    setForm({
      email: u.email,
      full_name: u.full_name ?? '',
      password: '',
      role: u.role,
    });
    setErrors({});
    setEditing(u);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateMemberForm(form, editing === 'new');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    saveMutation.mutate();
  }

  const confirmReset = (u: BusinessUser) =>
    setPendingAction({ kind: 'reset', member: u });
  const confirmRemove = (u: BusinessUser) =>
    setPendingAction({ kind: 'remove', member: u });

  function copyCredentials(c: { email: string; password: string }) {
    navigator.clipboard
      .writeText(
        `Email: ${c.email}
Temporary password: ${c.password}`
      )
      .then(() => toast.success('Copied email and password'))
      .catch(() => toast.error('Copy failed'));
  }

  const tabBtn = (id: 'members' | 'activity', label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className="filter-chip"
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Modal
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Share these sign-in details"
        description="The password is shown only once. They must change it on first login."
        maxWidth="md"
      >
        {issued && (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="type-label">Email</dt>
                <dd className="break-all">{issued.email}</dd>
              </div>
              <div>
                <dt className="type-label">Temporary password</dt>
                <dd>
                  <code className="rounded-lg bg-dark-100 px-2 py-1 font-mono dark:bg-dark-900/60">
                    {issued.password}
                  </code>
                </dd>
              </div>
            </dl>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyCredentials(issued)}
              >
                <Copy className="h-4 w-4" aria-hidden /> Copy email &amp;
                password
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIssued(null)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDeleteModal
        isOpen={pendingAction !== null}
        isLoading={resetMutation.isPending || removeMutation.isPending}
        title={
          pendingAction?.kind === 'reset' ? 'Reset password?' : 'Remove member?'
        }
        description={
          pendingAction?.kind === 'reset'
            ? `Reset the password for ${pendingAction.member.email}? Their current password stops working.`
            : pendingAction
              ? `Remove ${pendingAction.member.email}? Their login is deleted and their clients are reassigned to you. This cannot be undone. (Use Disable to keep the account.)`
              : ''
        }
        confirmLabel={pendingAction?.kind === 'reset' ? 'Reset' : 'Remove'}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          if (pendingAction.kind === 'reset')
            resetMutation.mutate(pendingAction.member);
          else removeMutation.mutate(pendingAction.member);
        }}
      />

      <div className="flex gap-2">
        {tabBtn('members', `Members (${members.length})`)}
        {tabBtn('activity', 'Activity')}
      </div>

      {tab === 'activity' ? (
        <ActivityLog api={api} />
      ) : (
        <>
          {data && <SeatMeter used={data.seats_used} max={data.max_users} />}

          <>
            <Modal
              open={editing !== null}
              onClose={() => setEditing(null)}
              title={editing === 'new' ? 'Add team member' : 'Edit team member'}
              maxWidth="md"
            >
              <form onSubmit={onSubmit} noValidate className="space-y-3">
                <div>
                  <label htmlFor="member-email" className="field-label">
                    Login email *
                  </label>
                  <input
                    id="member-email"
                    type="email"
                    className="field"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    autoComplete="off"
                    autoFocus
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={
                      errors.email ? 'member-email-err' : undefined
                    }
                  />
                  {errors.email && (
                    <p
                      id="member-email-err"
                      role="alert"
                      className="mt-1 text-xs text-red-600"
                    >
                      {errors.email}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="member-name" className="field-label">
                    Name
                  </label>
                  <input
                    id="member-name"
                    className="field"
                    value={form.full_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, full_name: e.target.value }))
                    }
                    maxLength={255}
                  />
                </div>
                <div>
                  <label htmlFor="member-role" className="field-label">
                    Role
                  </label>
                  <select
                    id="member-role"
                    className="field"
                    value={form.role}
                    disabled={editing !== 'new' && editing?.id === selfId}
                    aria-describedby="member-role-hint"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        role: e.target.value as TeamRole,
                      }))
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_INFO[r].label}
                      </option>
                    ))}
                  </select>
                  <p id="member-role-hint" className={`mt-1 text-xs ${MUTED}`}>
                    {editing !== 'new' && editing?.id === selfId
                      ? 'You cannot change your own role.'
                      : ROLE_INFO[form.role].blurb}
                  </p>
                </div>
                {editing === 'new' && (
                  <div>
                    <label htmlFor="member-password" className="field-label">
                      Temporary password *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          id="member-password"
                          type={showPassword ? 'text' : 'password'}
                          className="field !pr-11"
                          value={form.password}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, password: e.target.value }))
                          }
                          autoComplete="new-password"
                          aria-invalid={errors.password ? true : undefined}
                          aria-describedby="member-password-hint"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? 'Hide password' : 'Show password'
                          }
                          className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-dark-500"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            password: generateTempPassword(),
                          }));
                          setShowPassword(true);
                        }}
                      >
                        <Dices className="h-4 w-4" aria-hidden /> Generate
                      </button>
                    </div>
                    <p
                      id="member-password-hint"
                      className={`mt-1 text-xs ${
                        errors.password ? 'text-red-600' : MUTED
                      }`}
                      role={errors.password ? 'alert' : undefined}
                    >
                      {errors.password ??
                        `At least ${MIN_PASSWORD_LENGTH} characters. They must change it on first sign-in; you will be able to copy it after saving.`}
                    </p>
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
            </Modal>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-sm ${MUTED}`}>
                People who can sign in to this business.
              </p>
              <button
                type="button"
                onClick={openNew}
                className="btn-primary"
                disabled={seatsFull}
                aria-describedby={seatsFull ? 'seat-full-note' : undefined}
              >
                <Plus className="h-4 w-4" /> Add member
              </button>
            </div>
            {seatsFull && (
              <p
                id="seat-full-note"
                className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                All {data?.max_users} seats are in use, so you cannot add
                another member. Disable a member below to free a seat, or ask
                your platform administrator for more.
              </p>
            )}
            <dl
              aria-label="What each role can do"
              className="grid gap-2 text-xs sm:grid-cols-3"
            >
              {ROLES.map((r) => (
                <div
                  key={r}
                  className="rounded-xl border border-line px-3 py-2"
                >
                  <dt className="font-semibold text-dark-900 dark:text-white">
                    {ROLE_INFO[r].label}
                  </dt>
                  <dd className={MUTED}>{ROLE_INFO[r].blurb}</dd>
                </div>
              ))}
            </dl>
            <ul className="surface divide-y divide-line dark:divide-line">
              {isLoading && (
                <li className="px-4 py-3">
                  <LoadingRegion label="Loading team" className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </LoadingRegion>
                </li>
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
                          <span className={`ml-2 text-xs ${MUTED}`}>(you)</span>
                        )}
                      </p>
                      <p className={`text-xs ${MUTED}`}>
                        {u.full_name && `${u.email} · `}
                        {ROLE_INFO[u.role]?.label ?? u.role}
                        {!u.is_active && ' · disabled'}
                        {u.client_count != null &&
                          ` · ${u.client_count} client${u.client_count === 1 ? '' : 's'}`}
                        {u.must_change_password && ' · temp password'}
                        {' · '}
                        {u.last_login_at
                          ? `last seen ${fmtDateTime(u.last_login_at)}`
                          : 'never signed in'}
                      </p>
                    </div>
                    <RowMenu
                      label={`More actions for ${u.full_name || u.email}`}
                      items={[
                        {
                          label: 'Edit',
                          icon: <Pencil className="h-4 w-4" />,
                          onSelect: () => openEdit(u),
                        },
                        ...(manageClientAccess && u.role === 'designer'
                          ? [
                              {
                                label: 'Client access',
                                icon: <FolderKey className="h-4 w-4" />,
                                onSelect: () =>
                                  setAccessFor(
                                    accessFor === u.id ? null : u.id
                                  ),
                              },
                            ]
                          : []),
                        ...(isSelf
                          ? []
                          : [
                              {
                                label: 'Reset password',
                                icon: <KeyRound className="h-4 w-4" />,
                                onSelect: () => confirmReset(u),
                                disabled: resetMutation.isPending,
                              },
                              {
                                label: u.is_active ? 'Disable' : 'Enable',
                                icon: <Power className="h-4 w-4" />,
                                onSelect: () => toggleMutation.mutate(u),
                                disabled:
                                  toggleMutation.isPending ||
                                  (!u.is_active && seatsFull),
                              },
                              {
                                label: 'Remove',
                                icon: <Trash2 className="h-4 w-4" />,
                                onSelect: () => confirmRemove(u),
                                disabled: removeMutation.isPending,
                                danger: true,
                              },
                            ]),
                      ]}
                    />
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
        </>
      )}
    </div>
  );
}

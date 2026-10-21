'use client';

import { useTheme } from '@/components/providers/ThemeProvider';
import { CARD_CLS, INPUT_CLS } from '@/lib/constants';
import { changePassword, getMe, updateProfile } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Moon, Sun } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';

const LABEL_CLS = 'label-text';
const BTN_CLS = 'btn-primary';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Admin',
  designer: 'Designer',
};

function ProfileCard() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    if (me) setFullName(me.full_name ?? '');
  }, [me]);

  const mutation = useMutation({
    mutationFn: () => updateProfile(fullName.trim()),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Name is required');
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD_CLS} space-y-4`}>
      <h2 className="font-heading text-lg font-extrabold tracking-tight">
        Profile
      </h2>
      <div>
        <label className={LABEL_CLS}>Full name</label>
        <input
          className={INPUT_CLS}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={255}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLS}>Email</label>
          <input
            className={`${INPUT_CLS} opacity-60`}
            value={me?.email ?? ''}
            disabled
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Role</label>
          <input
            className={`${INPUT_CLS} opacity-60`}
            value={me ? (ROLE_LABELS[me.role] ?? me.role) : ''}
            disabled
          />
        </div>
        {me?.business_name && (
          <div>
            <label className={LABEL_CLS}>Business</label>
            <input
              className={`${INPUT_CLS} opacity-60`}
              value={me.business_name}
              disabled
            />
          </div>
        )}
      </div>
      <button type="submit" className={BTN_CLS} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

export function PasswordCard() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      toast.success('Password changed');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      toast.error('New passwords do not match');
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD_CLS} space-y-4`}>
      <h2 className="font-heading text-lg font-extrabold tracking-tight">
        Change password
      </h2>
      <div>
        <label className={LABEL_CLS}>Current password</label>
        <input
          type="password"
          className={INPUT_CLS}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLS}>New password</label>
          <input
            type="password"
            className={INPUT_CLS}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Confirm new password</label>
          <input
            type="password"
            className={INPUT_CLS}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <button type="submit" className={BTN_CLS} disabled={mutation.isPending}>
        {mutation.isPending ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ] as const;

  return (
    <div className={`${CARD_CLS} space-y-4`}>
      <h2 className="font-heading text-lg font-extrabold tracking-tight">
        Appearance
      </h2>
      <div className="flex gap-3">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={`flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${
              theme === value
                ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                : 'border-line text-dark-600 hover:bg-white/60 dark:border-primary-300/15 dark:text-dark-300 dark:hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanCard() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const access = me?.access;
  if (!me?.business_name || !access) return null;

  const { plan, days_left, expires_at, expired, warning_days } = access;
  const expiresOn = expires_at
    ? new Date(expires_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const urgent = expired || (days_left != null && days_left <= warning_days);

  return (
    <div className={`${CARD_CLS} space-y-4`}>
      <h2 className="font-heading text-lg font-extrabold tracking-tight">
        Plan
      </h2>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="field-label !mb-1.5">Current plan</p>
          <span
            className={`badge !px-3 !py-1 !text-sm uppercase ${
              plan === 'pro'
                ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-400/15 dark:text-primary-300'
                : 'bg-dark-100 text-dark-700 dark:bg-white/10 dark:text-dark-300'
            }`}
          >
            {plan}
          </span>
        </div>
        {days_left != null && (
          <div>
            <p className="field-label !mb-1.5">Time left</p>
            <p
              className={`flex items-center gap-1.5 text-sm font-bold ${
                urgent
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-dark-900 dark:text-white'
              }`}
            >
              <Clock className="h-4 w-4" />
              {expired
                ? 'Expired'
                : `${days_left} ${days_left === 1 ? 'day' : 'days'} left`}
            </p>
          </div>
        )}
        {expiresOn && (
          <div>
            <p className="field-label">
              {expired ? 'Expired on' : 'Renews by'}
            </p>
            <p className="text-sm font-bold text-dark-900 dark:text-white">
              {expiresOn}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Profile, plan, password and theme settings shared by the portal and /admin. */
export default function AccountSettings() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ProfileCard />
      <PlanCard />
      <PasswordCard />
      <AppearanceCard />
    </div>
  );
}

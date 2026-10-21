'use client';

import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ApiError } from '@/lib/api';
import { createBusiness, updateBusiness } from '@/lib/businesses';
import { Plan } from '@/lib/schemas/auth';
import { Business } from '@/lib/schemas/business';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface FormState {
  name: string;
  contact_email: string;
  contact_phone: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  plan: Plan;
  access_date: string; // yyyy-mm-dd; empty = no limit
  warning_days: string;
  max_users: string; // empty = unlimited
  max_images: string; // empty = unlimited
  max_image_mb: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  contact_email: '',
  contact_phone: '',
  plan: 'free',
  access_date: '',
  warning_days: '7',
  max_users: '5',
  max_images: '50',
  max_image_mb: '5',
  admin_name: '',
  admin_email: '',
  admin_password: '',
};

const FREE_MONTH_OPTIONS = [1, 2, 3, 6, 12];

const blankToNull = (v: string): string | null => (v.trim() ? v.trim() : null);

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthsFromToday(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return toDateInput(d);
}

/** Access runs through the end of the chosen local day. */
function endOfDayIso(date: string): string | null {
  if (!date) return null;
  return new Date(`${date}T23:59:59`).toISOString();
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error
    ? err.message
    : 'Something went wrong';
}

function formFor(business: Business | null): FormState {
  if (!business) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    name: business.name,
    contact_email: business.contact_email ?? '',
    contact_phone: business.contact_phone ?? '',
    plan: business.plan,
    access_date: business.access_expires_at
      ? toDateInput(new Date(business.access_expires_at))
      : '',
    warning_days: String(business.warning_days),
    max_users: business.max_users?.toString() ?? '',
    max_images: business.max_images?.toString() ?? '',
    max_image_mb: business.max_image_mb?.toString() ?? '',
  };
}

interface Props {
  open: boolean;
  /** null = create a new business */
  business: Business | null;
  onClose: () => void;
}

/** Create / edit form. Mount it with a `key` so state resets per target. */
export function BusinessFormModal({ open, business, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => formFor(business));
  const editing = business !== null;

  const saveMutation = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(),
        contact_email: blankToNull(form.contact_email),
        contact_phone: blankToNull(form.contact_phone),
        plan: form.plan,
        access_expires_at: endOfDayIso(form.access_date),
        warning_days: Number(form.warning_days),
        max_users: form.max_users ? Number(form.max_users) : null,
        max_images: form.max_images ? Number(form.max_images) : null,
        max_image_mb: form.max_image_mb ? Number(form.max_image_mb) : null,
      };
      if (business) return updateBusiness(business.id, base);
      return createBusiness({
        ...base,
        admin_name: blankToNull(form.admin_name),
        admin_email: blankToNull(form.admin_email),
        admin_password: form.admin_password || null,
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Business updated' : 'Business added');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      // Sidebar business name comes from /auth/me
      queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Business name is required');
      return;
    }
    const warn = Number(form.warning_days);
    if (!Number.isInteger(warn) || warn < 0 || warn > 365) {
      toast.error('Warning days must be between 0 and 365');
      return;
    }
    const maxUsers = form.max_users ? Number(form.max_users) : null;
    if (maxUsers !== null && (!Number.isInteger(maxUsers) || maxUsers < 1)) {
      toast.error('Team size must be a whole number of 1 or more, or empty');
      return;
    }
    const maxImages = form.max_images ? Number(form.max_images) : null;
    if (maxImages !== null && (!Number.isInteger(maxImages) || maxImages < 0)) {
      toast.error('Image limit must be a whole number, or empty for unlimited');
      return;
    }
    const maxMb = form.max_image_mb ? Number(form.max_image_mb) : null;
    if (
      maxMb !== null &&
      (!Number.isInteger(maxMb) || maxMb < 1 || maxMb > 100)
    ) {
      toast.error('Max image size must be 1–100 MB, or empty for the default');
      return;
    }
    if (!editing && !!form.admin_email !== !!form.admin_password) {
      toast.error('Provide both admin email and password, or neither');
      return;
    }
    if (!editing && form.admin_password && form.admin_password.length < 8) {
      toast.error('Admin password must be at least 8 characters');
      return;
    }
    saveMutation.mutate();
  }

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit business' : 'Add business'}
      maxWidth="md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="field-label">Business name *</label>
          <input
            className="field"
            value={form.name}
            onChange={set('name')}
            maxLength={255}
            autoFocus
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Contact email</label>
            <input
              type="email"
              className="field"
              value={form.contact_email}
              onChange={set('contact_email')}
            />
          </div>
          <div>
            <label className="field-label">Contact phone</label>
            <input
              className="field"
              value={form.contact_phone}
              onChange={set('contact_phone')}
              maxLength={50}
            />
          </div>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line p-3 dark:border-primary-300/15">
          <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
            Plan &amp; access
          </legend>
          <div>
            <label className="field-label">Plan</label>
            <select
              className="field"
              value={form.plan}
              onChange={(e) =>
                setForm((f) => ({ ...f, plan: e.target.value as Plan }))
              }
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Access until</label>
              <input
                type="date"
                className="field"
                value={form.access_date}
                onChange={set('access_date')}
              />
            </div>
            <div>
              <label className="field-label">Warn when days left ≤</label>
              <input
                type="number"
                min={0}
                max={365}
                className="field"
                value={form.warning_days}
                onChange={set('warning_days')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {FREE_MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, access_date: monthsFromToday(m) }))
                }
                className="rounded-full border border-line px-3 py-1.5 text-xs text-dark-700 hover:bg-primary-50/70 dark:border-primary-300/15 dark:text-dark-300 dark:hover:bg-white/[0.06]"
              >
                {m} mo from today
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, access_date: '' }))}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-dark-700 hover:bg-primary-50/70 dark:border-primary-300/15 dark:text-dark-300 dark:hover:bg-white/[0.06]"
            >
              No limit
            </button>
          </div>
          <p className="text-xs text-dark-500 dark:text-dark-400">
            After this date the business is blocked from clients, board,
            conversations and quotations until you extend it.
          </p>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3 dark:border-primary-300/15">
          <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
            Team
          </legend>
          <div>
            <label className="field-label">Max team members</label>
            <input
              type="number"
              min={1}
              className="field"
              placeholder="Unlimited"
              value={form.max_users}
              onChange={set('max_users')}
            />
          </div>
          <p className="text-xs text-dark-500 dark:text-dark-400">
            {business
              ? `${business.seats_used} active member${business.seats_used === 1 ? '' : 's'} now. `
              : ''}
            Only active members use a seat; the business admin manages the team
            within this limit. Leave empty for no limit.
          </p>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3 dark:border-primary-300/15">
          <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
            Image uploads
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Max images</label>
              <input
                type="number"
                min={0}
                className="field"
                placeholder="Unlimited"
                value={form.max_images}
                onChange={set('max_images')}
              />
            </div>
            <div>
              <label className="field-label">Max size per image (MB)</label>
              <input
                type="number"
                min={1}
                max={100}
                className="field"
                placeholder="Server default"
                value={form.max_image_mb}
                onChange={set('max_image_mb')}
              />
            </div>
          </div>
          {business && (
            <p className="text-xs text-dark-500 dark:text-dark-400">
              Used: {business.image_count} uploaded image
              {business.image_count === 1 ? '' : 's'}. Leave a field empty for
              no limit.
            </p>
          )}
        </fieldset>

        {!editing && (
          <fieldset className="space-y-3 rounded-xl border border-line p-3 dark:border-primary-300/15">
            <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
              First login (optional)
            </legend>
            <input
              className="field"
              aria-label="Admin name"
              placeholder="Admin name"
              value={form.admin_name}
              onChange={set('admin_name')}
            />
            <input
              type="email"
              className="field"
              aria-label="Admin email"
              placeholder="Admin email"
              value={form.admin_email}
              onChange={set('admin_email')}
              autoComplete="off"
            />
            <input
              type="password"
              className="field"
              aria-label="Temporary password"
              placeholder="Temporary password (min 8 chars)"
              value={form.admin_password}
              onChange={set('admin_password')}
              autoComplete="new-password"
            />
          </fieldset>
        )}

        <ModalFooter
          type="submit"
          onCancel={onClose}
          confirmLabel={editing ? 'Save changes' : 'Add business'}
          loading={saveMutation.isPending}
        />
      </form>
    </Modal>
  );
}

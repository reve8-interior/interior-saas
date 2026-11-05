'use client';

import {
  IssuedCredentialsModal,
  type IssuedCredentials,
} from '@/components/shared/IssuedCredentialsModal';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { createBusiness, updateBusiness } from '@/lib/businesses';
import { listAdminPlans } from '@/lib/plans';
import { getMe } from '@/lib/profile';
import type { Plan } from '@/lib/schemas/auth';
import { Business } from '@/lib/schemas/business';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { endOfDayIso } from '@/lib/dates';

interface FormState {
  name: string;
  contact_email: string;
  contact_phone: string;
  admin_name: string;
  admin_email: string;
  plan: Plan;
  access_date: string; // yyyy-mm-dd; empty = no limit
  warning_days: string;
  ai_credit_bonus: string;
  // Overrides of the plan; empty = follow the plan.
  max_users: string;
  max_clients: string;
  max_quotation_versions: string;
  max_images: string;
  max_image_mb: string;
  max_portfolio_designs: string;
}

const OVERRIDES = [
  { key: 'max_users', label: 'Team members', min: 1 },
  { key: 'max_clients', label: 'Active clients', min: 0 },
  { key: 'max_quotation_versions', label: 'Versions per quotation', min: 0 },
  { key: 'max_images', label: 'Uploaded images', min: 0 },
  { key: 'max_image_mb', label: 'Max image size (MB)', min: 1 },
  { key: 'max_portfolio_designs', label: 'Portfolio designs', min: 0 },
] as const;

const EMPTY_FORM: FormState = {
  name: '',
  contact_email: '',
  contact_phone: '',
  plan: 'free',
  access_date: '',
  warning_days: '7',
  ai_credit_bonus: '0',
  max_users: '',
  max_clients: '',
  max_quotation_versions: '',
  max_images: '',
  max_image_mb: '',
  max_portfolio_designs: '',
  admin_name: '',
  admin_email: '',
};

const FREE_MONTH_OPTIONS = [1, 2, 3, 6, 12];

/** Empty -> null: the business follows its plan for this limit. */
const overrideValue = (v: string): number | null =>
  v.trim() ? Number(v) : null;

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

/** The plan's value for a limit, shown when no override is set. */
function planValue(
  business: Business | null,
  key: (typeof OVERRIDES)[number]['key']
): string {
  if (!business?.limits) return 'From plan';
  const value = business.limits[key];
  return value === null ? 'Unlimited (plan)' : `${value} (plan)`;
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
    ai_credit_bonus: String(business.ai_credit_bonus),
    max_users: business.max_users?.toString() ?? '',
    max_clients: business.max_clients?.toString() ?? '',
    max_quotation_versions: business.max_quotation_versions?.toString() ?? '',
    max_images: business.max_images?.toString() ?? '',
    max_image_mb: business.max_image_mb?.toString() ?? '',
    max_portfolio_designs: business.max_portfolio_designs?.toString() ?? '',
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
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const editing = business !== null;
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: plans = [] } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: listAdminPlans,
  });
  // Keep the business's current plan selectable while the list loads.
  const planOptions = plans.some((p) => p.slug === form.plan)
    ? plans
    : [...plans, { slug: form.plan, name: business?.plan_name ?? form.plan }];

  const saveMutation = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(),
        contact_email: editing ? blankToNull(form.contact_email) : null,
        contact_phone: blankToNull(form.contact_phone),
        plan: form.plan,
        access_expires_at: endOfDayIso(form.access_date),
        warning_days: Number(form.warning_days),
        ai_credit_bonus: Number(form.ai_credit_bonus || 0),
        max_users: overrideValue(form.max_users),
        max_clients: overrideValue(form.max_clients),
        max_quotation_versions: overrideValue(form.max_quotation_versions),
        max_images: overrideValue(form.max_images),
        max_image_mb: overrideValue(form.max_image_mb),
        max_portfolio_designs: overrideValue(form.max_portfolio_designs),
      };
      if (business) return updateBusiness(business.id, base);
      return createBusiness({
        ...base,
        admin_name: blankToNull(form.admin_name),
        admin_email: blankToNull(form.admin_email),
      });
    },
    onSuccess: (saved) => {
      const adminEmail = form.admin_email.trim();
      toast.success(
        saved.invite_sent
          ? `Business added. Invite emailed to ${adminEmail}`
          : editing
            ? 'Business updated'
            : 'Business added'
      );
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      // Sidebar business name comes from /auth/me
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // No email configured: a password was generated, show it once.
      if (!editing && !saved.invite_sent && saved.temporary_password) {
        setIssued({ email: adminEmail, password: saved.temporary_password });
        return;
      }
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
    for (const { key, label, min } of OVERRIDES) {
      const n = overrideValue(form[key]);
      if (n !== null && (!Number.isInteger(n) || n < min)) {
        toast.error(`${label} must be a whole number of ${min}+, or empty`);
        return;
      }
    }
    const mb = overrideValue(form.max_image_mb);
    if (mb !== null && mb > 100) {
      toast.error('Max image size must be 1-100 MB, or empty');
      return;
    }
    const bonus = Number(form.ai_credit_bonus || 0);
    if (!Number.isInteger(bonus) || bonus < 0) {
      toast.error('Bonus AI credits must be a whole number of 0 or more');
      return;
    }
    if (!editing && !form.admin_email.trim()) {
      toast.error('Admin email is required');
      return;
    }
    saveMutation.mutate();
  }

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <IssuedCredentialsModal
        credentials={issued}
        onClose={() => {
          setIssued(null);
          onClose();
        }}
      />
      <Modal
        open={open && issued === null}
        onClose={onClose}
        title={editing ? 'Edit business' : 'Add business'}
        maxWidth="4xl"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div>
              <label className="field-label">Phone</label>
              <input
                className="field"
                value={form.contact_phone}
                onChange={set('contact_phone')}
                maxLength={50}
              />
            </div>
            {editing ? (
              <div className="sm:col-span-2">
                <label className="field-label">Contact email</label>
                <input
                  type="email"
                  className="field"
                  value={form.contact_email}
                  onChange={set('contact_email')}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="field-label">Admin name</label>
                  <input
                    className="field"
                    value={form.admin_name}
                    onChange={set('admin_name')}
                  />
                </div>
                <div>
                  <label className="field-label">Admin email *</label>
                  <input
                    type="email"
                    className="field"
                    value={form.admin_email}
                    onChange={set('admin_email')}
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs text-muted sm:col-span-2">
                  The admin signs in with this email (also the business&apos;s
                  contact email). We email them a link to confirm it and set
                  their own password. If email isn&apos;t set up, a temporary
                  password is generated and shown once after adding.
                </p>
              </>
            )}
          </div>

          <fieldset className="space-y-3 rounded-xl bg-surface-2 p-3 dark:border-line">
            <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
              Plan &amp; access
            </legend>
            <div>
              <label className="field-label">Plan</label>
              <select
                className="field"
                value={form.plan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, plan: e.target.value }))
                }
              >
                {planOptions.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
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
                  className="rounded-control border border-line px-3 py-1.5 text-xs text-dark-700 hover:bg-primary-50/70 dark:border-line dark:text-dark-300 dark:hover:bg-white/[0.06]"
                >
                  {m} mo from today
                </button>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, access_date: '' }))}
                className="rounded-control border border-line px-3 py-1.5 text-xs text-dark-700 hover:bg-primary-50/70 dark:border-line dark:text-dark-300 dark:hover:bg-white/[0.06]"
              >
                No limit
              </button>
            </div>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              After this date the business is blocked from clients, board,
              meeting notes and quotations until you extend it.
            </p>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl bg-surface-2 p-3 dark:border-line">
            <legend className="px-1 text-xs font-medium text-dark-500 dark:text-dark-400">
              Limit overrides
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {OVERRIDES.map(({ key, label, min }) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input
                    type="number"
                    min={min}
                    className="field"
                    placeholder={planValue(business, key)}
                    value={form[key]}
                    onChange={set(key)}
                  />
                </div>
              ))}
              <div>
                <label className="field-label">Bonus AI credits / month</label>
                <input
                  type="number"
                  min={0}
                  className="field"
                  value={form.ai_credit_bonus}
                  onChange={set('ai_credit_bonus')}
                />
              </div>
            </div>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              Leave a field empty to follow the plan (shown as the placeholder).
              {business
                ? ` In use now: ${business.seats_used} team seat${business.seats_used === 1 ? '' : 's'}, ${business.image_count} uploaded image${business.image_count === 1 ? '' : 's'}.`
                : ''}
            </p>
          </fieldset>

          <ModalFooter
            type="submit"
            onCancel={onClose}
            confirmLabel={
              editing
                ? 'Save changes'
                : me?.invites_enabled
                  ? 'Add business & send invite'
                  : 'Add business'
            }
            loading={saveMutation.isPending}
          />
        </form>
      </Modal>
    </>
  );
}

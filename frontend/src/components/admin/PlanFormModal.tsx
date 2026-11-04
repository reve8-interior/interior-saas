'use client';

import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { errorMessage } from '@/lib/errors';
import {
  FLAG_FIELDS,
  LIMIT_FIELDS,
  PlanFormState,
  planFormFor,
  planPayload,
} from '@/lib/planForm';
import { createPlan, updatePlan } from '@/lib/plans';
import type { AdminPlan } from '@/lib/schemas/plan';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  /** null = create a new plan */
  plan: AdminPlan | null;
  onClose: () => void;
}

const LEGEND_CLS = 'px-1 text-xs font-medium text-dark-500 dark:text-dark-400';
const FIELDSET_CLS = 'space-y-3 rounded-xl bg-surface-2 p-3 dark:border-line';

/** Create / edit a plan. Mount it with a `key` so state resets per target. */
export function PlanFormModal({ open, plan, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanFormState>(() => planFormFor(plan));
  const editing = plan !== null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = planPayload(form, editing);
      if (!result.ok) throw new Error(result.error);
      if (plan) {
        const { slug: _slug, ...changes } = result.payload;
        return updatePlan(plan.id, changes);
      }
      return createPlan(result.payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Plan updated' : 'Plan added');
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set = (k: keyof PlanFormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? `Edit ${plan.name}` : 'Add plan'}
      maxWidth="md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Name *</label>
            <input
              className="field"
              value={form.name}
              onChange={set('name')}
              maxLength={64}
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Slug *</label>
            <input
              className="field"
              value={form.slug}
              onChange={set('slug')}
              maxLength={32}
              disabled={editing}
              placeholder="e.g. agency"
            />
          </div>
        </div>
        <div>
          <label className="field-label">Tagline</label>
          <input
            className="field"
            value={form.tagline}
            onChange={set('tagline')}
            maxLength={255}
          />
        </div>

        <fieldset className={FIELDSET_CLS}>
          <legend className={LEGEND_CLS}>Price (INR, no GST)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label">Per month</label>
              <input
                inputMode="numeric"
                className="field"
                placeholder="Free"
                value={form.price_monthly_inr}
                onChange={set('price_monthly_inr')}
              />
            </div>
            <div>
              <label className="field-label">Per year</label>
              <input
                inputMode="numeric"
                className="field"
                placeholder="None"
                value={form.price_yearly_inr}
                onChange={set('price_yearly_inr')}
              />
            </div>
            <div>
              <label className="field-label">Order on page</label>
              <input
                inputMode="numeric"
                className="field"
                value={form.sort_order}
                onChange={set('sort_order')}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className={FIELDSET_CLS}>
          <legend className={LEGEND_CLS}>Limits (empty = unlimited)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMIT_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <input
                  inputMode="numeric"
                  className="field"
                  placeholder="Unlimited"
                  value={form[key]}
                  onChange={set(key)}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className={FIELDSET_CLS}>
          <legend className={LEGEND_CLS}>Features</legend>
          {FLAG_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <Switch
                label={label}
                checked={form[key]}
                onChange={(next) => setForm((f) => ({ ...f, [key]: next }))}
              />
            </div>
          ))}
        </fieldset>

        <fieldset className={FIELDSET_CLS}>
          <legend className={LEGEND_CLS}>Pricing page</legend>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Show on the pricing page</span>
            <Switch
              label="Show on the pricing page"
              checked={form.is_public}
              onChange={(next) => setForm((f) => ({ ...f, is_public: next }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Mark as recommended</span>
            <Switch
              label="Mark as recommended"
              checked={form.is_recommended}
              onChange={(next) =>
                setForm((f) => ({ ...f, is_recommended: next }))
              }
            />
          </div>
          <div>
            <label className="field-label">Extra bullet points</label>
            <textarea
              className="field"
              rows={3}
              placeholder="One per line"
              value={form.highlights}
              onChange={set('highlights')}
            />
          </div>
        </fieldset>

        <ModalFooter
          type="submit"
          onCancel={onClose}
          confirmLabel={editing ? 'Save changes' : 'Add plan'}
          loading={saveMutation.isPending}
        />
      </form>
    </Modal>
  );
}

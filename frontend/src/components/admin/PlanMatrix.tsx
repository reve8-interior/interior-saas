'use client';

import { Badge } from '@/components/ui';
import { syncPlanToRazorpay } from '@/lib/billing';
import { errorMessage } from '@/lib/errors';
import {
  BooleanRow,
  MATRIX_SECTIONS,
  NumberRow,
  TextRow,
  parseCell,
  parseText,
} from '@/lib/planMatrix';
import { updatePlan } from '@/lib/plans';
import type { AdminPlan, PlanUpdate } from '@/lib/schemas/plan';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  plans: AdminPlan[];
  onDelete: (plan: AdminPlan) => void;
}

interface CellProps {
  plan: AdminPlan;
  disabled: boolean;
  onSave: (plan: AdminPlan, changes: PlanUpdate) => void;
}

/** A number box that saves when you leave it, if what you typed changed. */
function NumberCell({
  plan,
  row,
  disabled,
  onSave,
}: CellProps & { row: NumberRow }) {
  const saved = plan[row.key];
  const savedText = saved === null ? '' : String(saved);
  const [draft, setDraft] = useState(savedText);

  function commit() {
    if (draft.trim() === savedText) return;
    const result = parseCell(draft, row);
    if (!result.ok) {
      toast.error(result.error);
      setDraft(savedText);
      return;
    }
    onSave(plan, { [row.key]: result.value });
  }

  return (
    <input
      inputMode="numeric"
      aria-label={`${row.label} for ${plan.name}`}
      className="field w-24 text-center"
      placeholder={row.placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** A text box (or one-per-line box) that saves when you leave it. */
function TextCell({
  plan,
  row,
  disabled,
  onSave,
}: CellProps & { row: TextRow }) {
  const value = plan[row.key];
  const savedText = Array.isArray(value) ? value.join('\n') : (value ?? '');
  const [draft, setDraft] = useState(savedText);

  function commit() {
    if (draft.trim() === savedText.trim()) return;
    const result = parseText(draft, row);
    if (!result.ok) {
      toast.error(result.error);
      setDraft(savedText);
      return;
    }
    onSave(plan, { [row.key]: result.value });
  }

  const shared = {
    'aria-label': `${row.label} for ${plan.name}`,
    className: 'field min-w-36',
    placeholder: row.placeholder,
    value: draft,
    disabled,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  if (row.multiline) return <textarea rows={4} {...shared} />;
  return (
    <input
      {...shared}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function BooleanCell({
  plan,
  row,
  disabled,
  onSave,
}: CellProps & { row: BooleanRow }) {
  return (
    <input
      type="checkbox"
      aria-label={`${row.label} for ${plan.name}`}
      className="h-5 w-5"
      checked={plan[row.key]}
      disabled={disabled}
      onChange={(e) => onSave(plan, { [row.key]: e.target.checked })}
    />
  );
}

/** Every plan side by side: tick features on or off and type the numbers. */
export function PlanMatrix({ plans, onDelete }: Props) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: ({ plan, changes }: { plan: AdminPlan; changes: PlanUpdate }) =>
      updatePlan(plan.id, changes),
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (plan: AdminPlan) => syncPlanToRazorpay(plan.id),
    onSuccess: (result) => {
      toast.success(
        result.created
          ? 'Created the Razorpay plan'
          : 'Already in sync with Razorpay'
      );
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const save = (plan: AdminPlan, changes: PlanUpdate) =>
    saveMutation.mutate({ plan, changes });
  const busy = saveMutation.isPending;

  return (
    <div className="surface overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-3 text-left">Feature</th>
            {plans.map((p) => (
              <th key={p.id} className="px-4 py-3 text-center">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs font-normal text-dark-500 dark:text-dark-400">
                  {p.slug}
                </p>
                <button
                  aria-label={`Delete ${p.name}`}
                  onClick={() => onDelete(p)}
                  className="btn-ghost p-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <td className="px-4 py-2">Razorpay plan</td>
            {plans.map((p) => (
              <td key={p.id} className="px-4 py-2 text-center">
                <RazorpaySync
                  plan={p}
                  disabled={syncMutation.isPending}
                  onSync={() => syncMutation.mutate(p)}
                />
              </td>
            ))}
          </tr>
          {MATRIX_SECTIONS.map((section) => (
            <SectionRows
              key={section.title}
              section={section}
              plans={plans}
              disabled={busy}
              onSave={save}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Whether the plan's monthly price exists on Razorpay, with a button to push it. */
function RazorpaySync({
  plan,
  disabled,
  onSync,
}: {
  plan: AdminPlan;
  disabled: boolean;
  onSync: () => void;
}) {
  if (plan.price_monthly_inr === null) {
    return <span className="text-dark-400">—</span>;
  }
  const synced =
    plan.razorpay_plan_id_monthly &&
    plan.razorpay_plan_price_inr === plan.price_monthly_inr;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={synced ? 'success' : 'warning'}>
        {synced ? 'Synced' : 'Not synced'}
      </Badge>
      <button className="btn-ghost btn-sm" disabled={disabled} onClick={onSync}>
        Sync
      </button>
    </span>
  );
}

function SectionRows({
  section,
  plans,
  disabled,
  onSave,
}: {
  section: (typeof MATRIX_SECTIONS)[number];
  plans: AdminPlan[];
  disabled: boolean;
  onSave: CellProps['onSave'];
}) {
  return (
    <>
      <tr className="border-t border-line bg-surface-2">
        <th
          colSpan={plans.length + 1}
          className="px-4 py-2 text-left text-xs font-medium text-dark-500 dark:text-dark-400"
        >
          {section.title}
        </th>
      </tr>
      {section.texts?.map((row) => (
        <tr key={row.key} className="border-t border-line">
          <td className="px-4 py-2">{row.label}</td>
          {plans.map((p) => (
            <td key={p.id} className="px-4 py-2 text-center">
              <TextCell
                key={`${p.id}-${String(p[row.key])}`}
                plan={p}
                row={row}
                disabled={disabled}
                onSave={onSave}
              />
            </td>
          ))}
        </tr>
      ))}
      {section.numbers.map((row) => (
        <tr key={row.key} className="border-t border-line">
          <td className="px-4 py-2">{row.label}</td>
          {plans.map((p) => (
            <td key={p.id} className="px-4 py-2 text-center">
              {/* key includes the saved value so a refetch resets the draft */}
              <NumberCell
                key={`${p.id}-${p[row.key]}`}
                plan={p}
                row={row}
                disabled={disabled}
                onSave={onSave}
              />
            </td>
          ))}
        </tr>
      ))}
      {section.booleans.map((row) => (
        <tr key={row.key} className="border-t border-line">
          <td className="px-4 py-2">{row.label}</td>
          {plans.map((p) => (
            <td key={p.id} className="px-4 py-2 text-center">
              <BooleanCell
                plan={p}
                row={row}
                disabled={disabled}
                onSave={onSave}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

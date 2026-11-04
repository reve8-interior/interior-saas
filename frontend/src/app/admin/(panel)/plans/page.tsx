'use client';

import { PlanFormModal } from '@/components/admin/PlanFormModal';
import { Badge, ConfirmDeleteModal, PageLoader } from '@/components/ui';
import { isSuperadmin } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import {
  deletePlan,
  formatInr,
  formatLimit,
  getPricingVisibility,
  listAdminPlans,
  setPricingVisibility,
} from '@/lib/plans';
import type { AdminPlan } from '@/lib/schemas/plan';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const priceOf = (p: AdminPlan): string =>
  p.price_monthly_inr === null
    ? 'Free'
    : `${formatInr(p.price_monthly_inr)}/mo`;

const HEADERS = [
  'Plan',
  'Price',
  'Team',
  'Clients',
  'AI credits',
  'Pricing page',
  '',
];

export default function PlansPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [allowed, setAllowed] = useState(false);
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminPlan | null>(null);

  useEffect(() => {
    if (!isSuperadmin()) {
      router.replace('/admin/login');
      return;
    }
    setAllowed(true);
  }, [router]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: listAdminPlans,
    enabled: allowed,
  });

  const { data: visibility } = useQuery({
    queryKey: ['admin-pricing-visibility'],
    queryFn: getPricingVisibility,
    enabled: allowed,
  });

  const visibilityMutation = useMutation({
    mutationFn: setPricingVisibility,
    onSuccess: (res) => {
      toast.success(
        res.show_pricing
          ? 'Pricing table shown on landing page'
          : 'Pricing table hidden'
      );
      queryClient.setQueryData(['admin-pricing-visibility'], res);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (plan: AdminPlan) => deletePlan(plan.id),
    onSuccess: () => {
      toast.success('Plan deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      setRemoving(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!allowed) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-dark-500 dark:text-dark-400">
          Edit prices, limits and features. Changes apply to every business on
          the plan straight away; a business&apos;s own overrides still win.
        </p>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary sm:ml-auto"
        >
          <Plus className="h-4 w-4" /> Add plan
        </button>
      </div>

      <label className="surface flex items-center justify-between gap-4 p-4">
        <span>
          <span className="block text-sm font-medium">
            Show pricing table on landing page
          </span>
          <span className="block text-xs text-dark-500 dark:text-dark-400">
            Hides the section and its nav link. Can take up to 5 minutes to
            reach visitors.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="h-5 w-5 shrink-0"
          checked={visibility?.show_pricing ?? true}
          disabled={!visibility || visibilityMutation.isPending}
          onChange={(e) => visibilityMutation.mutate(e.target.checked)}
        />
      </label>

      {isLoading && <PageLoader />}

      {plans.length > 0 && (
        <div className="surface overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead className="table-head">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="px-4 py-3 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-dark-500 dark:text-dark-400">
                      {p.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3">{priceOf(p)}</td>
                  <td className="px-4 py-3">{formatLimit(p.max_users)}</td>
                  <td className="px-4 py-3">{formatLimit(p.max_clients)}</td>
                  <td className="px-4 py-3">
                    {formatLimit(p.ai_credits_monthly)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex gap-1.5">
                      <Badge tone={p.is_public ? 'success' : 'neutral'}>
                        {p.is_public ? 'Shown' : 'Hidden'}
                      </Badge>
                      {p.is_recommended && (
                        <Badge tone="warning">Recommended</Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setEditing(p)}
                      className="btn-ghost p-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Delete ${p.name}`}
                      onClick={() => setRemoving(p)}
                      className="btn-ghost p-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <PlanFormModal open plan={null} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <PlanFormModal
          key={editing.id}
          open
          plan={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDeleteModal
          isOpen
          title={`Delete ${removing.name}?`}
          description="Businesses on this plan must be moved first."
          onCancel={() => setRemoving(null)}
          onConfirm={() => removeMutation.mutate(removing)}
          isLoading={removeMutation.isPending}
        />
      )}
    </div>
  );
}

'use client';

import { PlanFormModal } from '@/components/admin/PlanFormModal';
import { PlanMatrix } from '@/components/admin/PlanMatrix';
import { ConfirmDeleteModal, PageLoader } from '@/components/ui';
import { Switch } from '@/components/ui/Switch';
import { isSuperadmin } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import {
  deletePlan,
  getPricingVisibility,
  listAdminPlans,
  setPricingVisibility,
} from '@/lib/plans';
import type { AdminPlan } from '@/lib/schemas/plan';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function PlansPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [allowed, setAllowed] = useState(false);
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

      <div className="surface flex items-center justify-between gap-4 p-4">
        <span>
          <span className="block text-sm font-medium">
            Show pricing table on landing page
          </span>
          <span className="block text-xs text-dark-500 dark:text-dark-400">
            Hides the section and its nav link. Can take up to 5 minutes to
            reach visitors.
          </span>
        </span>
        <Switch
          label="Show pricing table on landing page"
          checked={visibility?.show_pricing ?? true}
          disabled={!visibility || visibilityMutation.isPending}
          onChange={(next) => visibilityMutation.mutate(next)}
        />
      </div>

      {isLoading && <PageLoader />}

      {plans.length > 0 && <PlanMatrix plans={plans} onDelete={setRemoving} />}

      {adding && (
        <PlanFormModal open plan={null} onClose={() => setAdding(false)} />
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

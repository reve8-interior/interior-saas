'use client';

import { Modal } from '@/components/ui/Modal';
import { changePlan, getChangeQuote } from '@/lib/billing';
import { errorMessage } from '@/lib/errors';
import type {
  ChangeDirection,
  ChangePlanResponse,
} from '@/lib/schemas/billing';
import { useMutation, useQuery } from '@tanstack/react-query';

interface ChangePlanDialogProps {
  /** Slug of the plan to switch to; null keeps the dialog closed. */
  planSlug: string | null;
  onClose: () => void;
  /** Called with the server's answer once the customer confirmed. */
  onConfirmed: (
    response: ChangePlanResponse,
    direction: ChangeDirection
  ) => void;
}

const TITLES: Record<ChangeDirection, string> = {
  upgrade: 'Upgrade plan',
  downgrade: 'Downgrade plan',
  resume: 'Resume plan',
  keep: 'Keep your plan',
};

function confirmLabel(direction: ChangeDirection, due: number): string {
  if (direction === 'upgrade') return `Upgrade and pay ₹${due}`;
  if (direction === 'downgrade') return 'Schedule downgrade';
  if (direction === 'resume') return 'Resume plan';
  return 'Keep my plan';
}

/** Shows exactly what a plan switch costs and when it starts, then confirms. */
export function ChangePlanDialog({
  planSlug,
  onClose,
  onConfirmed,
}: ChangePlanDialogProps) {
  const quote = useQuery({
    queryKey: ['change-quote', planSlug],
    queryFn: () => getChangeQuote(planSlug as string),
    enabled: planSlug !== null,
    staleTime: 0,
    retry: false,
  });
  const confirm = useMutation({
    mutationFn: () => changePlan(planSlug as string),
    onSuccess: (response) =>
      onConfirmed(response, quote.data?.direction ?? 'upgrade'),
  });
  const q = quote.data;
  const busy = confirm.isPending;

  return (
    <Modal
      open={planSlug !== null}
      onClose={busy ? () => undefined : onClose}
      title={q ? TITLES[q.direction] : 'Change plan'}
      maxWidth="md"
    >
      <div className="space-y-4">
        {quote.isLoading && (
          <p className="text-sm text-dark-500">Checking the details…</p>
        )}
        {quote.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(quote.error)}
          </p>
        )}
        {q && (
          <>
            <p className="text-sm">
              {q.current_plan_name} → <strong>{q.target_plan_name}</strong>
            </p>
            <p className="text-sm text-dark-600 dark:text-dark-400">
              {q.summary}
            </p>
            {q.effective === 'now' && q.amount_due_inr > 0 && (
              <p className="flex justify-between border-t border-line pt-3 text-base font-extrabold">
                <span>Due today</span>
                <span>₹{q.amount_due_inr.toLocaleString('en-IN')}</span>
              </p>
            )}
          </>
        )}
        {confirm.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(confirm.error)}
          </p>
        )}
        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1"
            onClick={onClose}
            disabled={busy}
          >
            Not now
          </button>
          <button
            className="btn-primary flex-1"
            disabled={!q || busy}
            onClick={() => confirm.mutate()}
          >
            {busy
              ? 'Working…'
              : q
                ? confirmLabel(q.direction, q.amount_due_inr)
                : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { api } from '@/lib/api';
import { reviewQueue, type ReviewableCheckpoint } from '@/lib/checkpoints';
import { listDesigns } from '@/lib/designs';
import { nextStep } from '@/lib/nextStep';
import { getQuotation } from '@/lib/quotation';
import { listQuotationVersions } from '@/lib/quotationVersions';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/**
 * Points at the one thing to do next for this client, derived from what already
 * exists: meetings to review, quotation rows, saved versions, designs. Renders
 * nothing once every step is done. Shares query keys with the workspace tabs,
 * so it adds no extra requests.
 */
export function NextStepCard({ clientId }: { clientId: string }) {
  const base = `/dashboard/clients/${clientId}`;
  const meetings = useQuery<ReviewableCheckpoint[]>({
    queryKey: ['checkpoints', clientId],
    queryFn: () =>
      api.get<ReviewableCheckpoint[]>(`/clients/${clientId}/checkpoints`),
  });
  const quotation = useQuery({
    queryKey: ['quotation', clientId],
    queryFn: () => getQuotation(clientId),
    retry: false,
  });
  const versions = useQuery({
    queryKey: ['quotation-versions', clientId],
    queryFn: () => listQuotationVersions(clientId),
  });
  const designs = useQuery({
    queryKey: ['designs', clientId],
    queryFn: () => listDesigns(clientId),
  });

  // Wait for every answer; a flash of the wrong suggestion is worse than none.
  const settled = [meetings, versions, designs].every((q) => !q.isLoading);
  if (!settled || quotation.isLoading) return null;

  const step = nextStep(base, {
    reviewCheckpointId: reviewQueue(meetings.data ?? [])[0]?.id ?? null,
    hasRows: (quotation.data?.rooms.length ?? 0) > 0,
    hasVersions: !!versions.data?.length,
    hasDesigns: !!designs.data?.length,
  });
  if (!step) return null;

  return (
    <Link
      href={step.href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-primary-300/40 bg-primary-50/70 px-4 py-3 transition-colors hover:bg-primary-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-line dark:bg-primary-500/10 dark:hover:bg-primary-500/15"
    >
      <div className="min-w-0">
        <p className="eyebrow">Next step</p>
        <p className="text-sm font-semibold text-dark-900 dark:text-white">
          {step.title}
        </p>
        <p className="text-xs text-dark-600 dark:text-dark-300">{step.hint}</p>
      </div>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5 dark:text-primary-300"
        aria-hidden
      />
    </Link>
  );
}

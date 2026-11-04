'use client';

import { Modal } from '@/components/ui/Modal';
import { reviewQuotation, type ReviewSeverity } from '@/lib/quotation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

const SEVERITY_STYLE: Record<
  ReviewSeverity,
  { icon: typeof Info; cls: string; label: string }
> = {
  error: {
    icon: XCircle,
    cls: 'text-red-600 dark:text-red-400',
    label: 'Fix before sending',
  },
  warning: {
    icon: AlertTriangle,
    cls: 'text-amber-600 dark:text-amber-400',
    label: 'Check',
  },
  info: {
    icon: Info,
    cls: 'text-sky-600 dark:text-sky-400',
    label: 'Worth a look',
  },
};

interface Props {
  clientId: string;
  onClose: () => void;
}

/** Lists what a careful colleague would flag before the quote goes out. */
export function QuotationReviewModal({ clientId, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation-review', clientId],
    queryFn: () => reviewQuotation(clientId),
  });

  return (
    <Modal open onClose={onClose} title="Review before sending">
      {isLoading && (
        <p className="text-sm text-dark-500 dark:text-dark-400">Checking…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t run the review.
        </p>
      )}
      {data && data.findings.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          Looks good — {data.items_checked} items checked, nothing to flag.
        </p>
      )}
      {data && data.findings.length > 0 && (
        <ul className="space-y-2">
          {data.findings.map((f, n) => {
            const { icon: Icon, cls, label } = SEVERITY_STYLE[f.severity];
            return (
              <li
                key={`${f.code}-${n}`}
                className="flex gap-2 text-sm text-dark-700 dark:text-dark-200"
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`}
                  aria-label={label}
                />
                <span>{f.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

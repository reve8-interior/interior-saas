'use client';

import { useQuery } from '@tanstack/react-query';
import { listQuotationVersions } from '@/lib/quotationVersions';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';

/** The version the customer's link shows now, if a link is live. */
export function useSharedVersion(
  clientId: string
): QuotationVersionSummary | undefined {
  const { data: versions = [] } = useQuery<QuotationVersionSummary[]>({
    queryKey: ['quotation-versions', clientId],
    queryFn: () => listQuotationVersions(clientId),
  });
  return versions.find((v) => v.is_shared);
}

/**
 * Asked when saving a version while the customer has a live link: show the
 * new version on that same link, or leave the customer on the one they have.
 * Off by default, so a half-finished version never reaches them by accident.
 */
export function KeepLinkToggle({
  shared,
  checked,
  onChange,
}: {
  shared: QuotationVersionSummary;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="text-sm">
        <span className="block font-semibold text-dark-900 dark:text-white">
          Show this on my customer&apos;s link
        </span>
        <span className="block text-dark-600 dark:text-dark-300">
          {checked
            ? 'They keep the same link and will see this version.'
            : `Leave off to keep showing version ${shared.number}.`}
        </span>
      </span>
    </label>
  );
}

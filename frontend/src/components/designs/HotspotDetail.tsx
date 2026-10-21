'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { fmtRate } from '@/lib/format';

export interface HotspotDetailItem {
  name: string;
  category: string;
  unit: string;
  /** Omitted when prices are hidden. */
  unit_cost?: string | number | null;
}

interface HotspotDetailProps {
  label: string;
  notes: string | null;
  item: HotspotDetailItem | null;
  dimensions?: string | null;
  /** Omitted when prices are hidden. */
  labourCost?: string | number | null;
  onClose: () => void;
  actions?: ReactNode;
}

/**
 * Hotspot details as a scrollable overlay: right-side drawer on desktop,
 * bottom sheet on mobile. The image stays clickable so hotspots can be switched; closes on X or Escape.
 */
export function HotspotDetail({
  label,
  notes,
  item,
  dimensions,
  labourCost,
  onClose,
  actions,
}: HotspotDetailProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <div
        role="dialog"
        aria-label={label}
        className="pointer-events-auto relative flex max-h-[50vh] w-full animate-fade-in flex-col rounded-t-2xl bg-white shadow-xl dark:bg-dark-900 sm:max-h-none sm:w-96 sm:rounded-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-dark-200 p-4 dark:border-dark-700">
          <h3 className="font-heading text-base font-semibold text-dark-900 dark:text-white">
            {label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-1 text-dark-500 hover:bg-dark-100 dark:text-dark-400 dark:hover:bg-dark-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {item || dimensions || labourCost != null ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {item && (
                <>
                  <dt className="text-dark-500 dark:text-dark-400">Material</dt>
                  <dd className="text-dark-900 dark:text-white">{item.name}</dd>
                  <dt className="text-dark-500 dark:text-dark-400">Category</dt>
                  <dd className="text-dark-900 dark:text-white">
                    {item.category}
                  </dd>
                </>
              )}
              {dimensions && (
                <>
                  <dt className="text-dark-500 dark:text-dark-400">
                    Dimensions
                  </dt>
                  <dd className="text-dark-900 dark:text-white">
                    {dimensions}
                  </dd>
                </>
              )}
              {item && item.unit_cost != null && (
                <>
                  <dt className="text-dark-500 dark:text-dark-400">Rate</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">
                    {fmtRate(item.unit_cost)} / {item.unit}
                  </dd>
                </>
              )}
              {labourCost != null && (
                <>
                  <dt className="text-dark-500 dark:text-dark-400">Labour</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">
                    {fmtRate(labourCost)}
                  </dd>
                </>
              )}
            </dl>
          ) : null}

          {notes && (
            <p className="whitespace-pre-line text-sm text-dark-600 dark:text-dark-300">
              {notes}
            </p>
          )}

          {actions}
        </div>
      </div>
    </div>
  );
}

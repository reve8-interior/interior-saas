'use client';

import type {
  LineItemStatus,
  QuotationDerivedState,
  QuotationLineItem,
} from '@/lib/schemas/quotation';
import Link from 'next/link';

export const STATE_LABELS: Record<QuotationDerivedState, string> = {
  draft: 'Draft',
  in_negotiation: 'In Negotiation',
  clarification_needed: 'Clarification Needed',
  ready_for_approval: 'Ready for Approval',
};

export const STATE_STYLES: Record<QuotationDerivedState, string> = {
  draft: 'bg-primary-100/70 text-gray-700 dark:bg-white/10 dark:text-dark-300',
  in_negotiation:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  clarification_needed:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ready_for_approval:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export const STATUS_STYLES: Record<LineItemStatus, string> = {
  draft: 'bg-primary-100/70 text-gray-600 dark:bg-white/10 dark:text-dark-300',
  priced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending_clarity:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  agreed:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  removed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

export const STATUS_OPTIONS: LineItemStatus[] = [
  'draft',
  'priced',
  'pending_clarity',
  'agreed',
  'removed',
];

export const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'dimension', 'lumpsum'];

/** Links back to where a line came from: its meeting notes and/or design. */
export function SourceChip({
  clientId,
  item,
  numbers,
}: {
  clientId: string;
  item: QuotationLineItem;
  numbers: Record<string, number>;
}) {
  const checkpointId = item.source_checkpoint_id ?? null;
  const n = checkpointId ? numbers[checkpointId] : undefined;
  const cls =
    'block text-xs font-normal text-primary-600 hover:underline dark:text-primary-400';
  return (
    <span className="mt-0.5 block space-y-0.5">
      {checkpointId && n && (
        <Link
          href={`/dashboard/clients/${clientId}/checkpoints#checkpoint-${checkpointId}`}
          className={cls}
        >
          From meeting #{n}
        </Link>
      )}
      {item.source_design_id && (
        <Link
          href={`/dashboard/clients/${clientId}/designs?edit=${item.source_design_id}${
            item.source_hotspot_id ? `&hotspot=${item.source_hotspot_id}` : ''
          }`}
          className={cls}
        >
          From design
          {item.source_design_title ? `: ${item.source_design_title}` : ''}
        </Link>
      )}
      {item.edited_by && (
        <span className="block text-xs font-normal text-dark-500 dark:text-dark-400">
          Edited by {item.edited_by}
        </span>
      )}
    </span>
  );
}

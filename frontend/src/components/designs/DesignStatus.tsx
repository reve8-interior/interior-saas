import { designProgress, linkedTotal } from '@/lib/designStatus';
import { fmtRupees } from '@/lib/format';
import type { Design } from '@/lib/schemas/design';

/** What is left to do on a design: mark items, then price them in the quotation. */
export function DesignStatus({
  design,
  priceByLineId,
  onReview,
}: {
  design: Design;
  /** Price of each quotation line, to total what this design adds up to. */
  priceByLineId?: ReadonlyMap<string, number>;
  /** Opens the editor so the unlinked hotspots can be added in one go. */
  onReview?: () => void;
}) {
  const { hotspots, linked } = designProgress(design);

  if (hotspots === 0) {
    return (
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        No items marked yet. Use Edit hotspots.
      </p>
    );
  }
  const done = linked === hotspots;
  const total = priceByLineId ? linkedTotal(design, priceByLineId) : 0;
  return (
    <div className="space-y-1">
      <p
        className={`text-xs font-medium ${
          done
            ? 'text-green-700 dark:text-green-400'
            : 'text-dark-600 dark:text-dark-300'
        }`}
      >
        {linked} of {hotspots} item{hotspots === 1 ? '' : 's'} in the quotation
        {done ? ' ✓' : ''}
        {total > 0 && ` · ${fmtRupees(total)}`}
      </p>
      {!done && onReview && (
        <button
          type="button"
          onClick={onReview}
          className="link-action inline-flex items-center text-xs"
        >
          Add the other {hotspots - linked} to the quotation →
        </button>
      )}
    </div>
  );
}

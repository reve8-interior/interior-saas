import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  checkpointNumbers,
  reviewQueue,
  storedRowCount,
  type ReviewableCheckpoint,
} from '@/lib/checkpoints';

/**
 * Points at the next meeting to review. Meetings must go in oldest first, so
 * only that one is offered and the rest are a count.
 */
export function MeetingReviewBanner({
  clientId,
  checkpoints,
}: {
  clientId: string;
  checkpoints: ReviewableCheckpoint[];
}) {
  const [next, ...later] = reviewQueue(checkpoints);
  if (!next) return null;
  const number = checkpointNumbers(checkpoints)[next.id];
  const rows = storedRowCount(next);

  return (
    <Link
      href={`/dashboard/clients/${clientId}/checkpoints#checkpoint-${next.id}`}
      className="group flex items-center justify-between gap-3 rounded-xl border border-primary-300/40 bg-primary-50/70 px-4 py-3 text-sm transition-colors hover:bg-primary-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-line dark:bg-primary-500/10 dark:hover:bg-primary-500/15"
    >
      <span className="min-w-0">
        <span className="font-semibold text-dark-900 dark:text-white">
          Meeting #{number} has{' '}
          {rows > 0
            ? `${rows} row${rows === 1 ? '' : 's'} to review`
            : 'notes to review'}
        </span>
        {later.length > 0 && (
          <span className="text-dark-600 dark:text-dark-300">
            {' '}
            · {later.length} more after this
          </span>
        )}
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5 dark:text-primary-300"
        aria-hidden
      />
    </Link>
  );
}

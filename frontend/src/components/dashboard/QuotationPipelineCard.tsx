import { fmtInr } from '@/lib/format';
import { ChartCard, EmptyChart } from './ChartCard';

interface Props {
  approved: number;
  pending: number;
  pendingCount: number;
}

const SEGMENTS = [
  { key: 'approved', label: 'Approved', color: '#0c96c2' },
  { key: 'pending', label: 'Awaiting approval', color: '#d9692c' },
] as const;

/** Approved vs awaiting split of quotation value, plus the average ticket size. */
export function QuotationPipelineCard({
  approved,
  pending,
  pendingCount,
}: Props) {
  const total = approved + pending;
  const values = { approved, pending };
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const avgPending = pendingCount > 0 ? pending / pendingCount : 0;

  return (
    <ChartCard
      title="Quotation pipeline"
      description="How much of the quoted value is approved"
      stat={
        total > 0 && (
          <>
            <p className="text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
              {approvalRate}%
            </p>
            <p className="text-xs text-dark-500 dark:text-dark-400">approved</p>
          </>
        )
      }
    >
      {total === 0 ? (
        <EmptyChart message="No quotations yet" />
      ) : (
        <div className="space-y-5">
          <div
            role="img"
            aria-label={`${approvalRate}% of ${fmtInr(total)} quoted value is approved`}
            className="flex h-4 gap-0.5 overflow-hidden rounded-full"
          >
            {SEGMENTS.filter((s) => values[s.key] > 0).map((s) => (
              <div
                key={s.key}
                className="min-w-1.5"
                style={{
                  flex: `${values[s.key]} 1 0`,
                  backgroundColor: s.color,
                }}
              />
            ))}
          </div>

          <ul className="divide-y divide-line dark:divide-primary-300/10">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-dark-700 dark:text-dark-200">
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-dark-900 dark:text-white">
                  {fmtInr(values[s.key])}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-3 py-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0" />
              <span className="flex-1 text-dark-700 dark:text-dark-200">
                Avg pending quotation
              </span>
              <span className="font-semibold tabular-nums text-dark-900 dark:text-white">
                {pendingCount > 0 ? fmtInr(Math.round(avgPending)) : '—'}
              </span>
            </li>
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

import { UsageMeters } from '@/components/settings/UsageMeters';
import { OPERATION_LABELS } from '@/lib/constants';
import type { UsageMeter } from '@/lib/schemas/auth';
import { ChartCard, EmptyChart } from './ChartCard';

interface Props {
  data: Record<string, number>;
  /** This month's AI credits, when the plan caps them. */
  credits?: UsageMeter;
}

/** What the assistant was used for, and how many credits are left. */
export function AiUsageChart({ data, credits }: Props) {
  const rows = Object.entries(data)
    .map(([operation, count]) => ({
      name: OPERATION_LABELS[operation] ?? operation,
      value: count,
    }))
    .sort((a, b) => b.value - a.value);
  const max = rows[0]?.value ?? 1;

  return (
    <ChartCard
      title="AI usage"
      description="What the assistant has been used for"
    >
      <div className="space-y-5">
        {credits && <UsageMeters meters={[credits]} />}
        {rows.length === 0 ? (
          <EmptyChart message="No AI usage yet" />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.name}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-dark-700 dark:text-dark-200">
                    {r.name}
                  </span>
                  <span className="font-semibold tabular-nums text-dark-900 dark:text-white">
                    {r.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-primary-100/80 dark:bg-white/10">
                  <div
                    className="h-2 rounded-full bg-brand"
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ChartCard>
  );
}

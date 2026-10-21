import { OPERATION_LABELS } from '@/lib/constants';
import { fmtSpeed, fmtUsd } from '@/lib/format';
import { ChartCard, EmptyChart } from './ChartCard';

interface Props {
  data: Record<string, number>;
  totalCalls: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 px-3 py-2.5 dark:border-primary-300/10 dark:bg-dark-900/50">
      <p className="text-xs text-dark-500 dark:text-dark-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-dark-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function AiUsageChart({
  data,
  totalCalls,
  totalCostUsd,
  avgLatencyMs,
}: Props) {
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
      {rows.length === 0 ? (
        <EmptyChart message="No AI usage yet" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Calls" value={totalCalls.toLocaleString()} />
            <Stat label="Cost" value={fmtUsd(totalCostUsd)} />
            <Stat label="Avg speed" value={fmtSpeed(avgLatencyMs)} />
          </div>
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
                    className="h-2 rounded-full bg-gradient-to-r from-primary-600 to-secondary-600"
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

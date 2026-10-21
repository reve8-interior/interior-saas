import { PHASE_COLORS_HEX, PHASE_LABELS, PHASE_ORDER } from '@/lib/constants';
import { ChartCard, EmptyChart } from './ChartCard';

interface Props {
  data: Record<string, number>;
  total: number;
}

/** Part-to-whole of clients across phases: one proportion bar + a legend table. */
export function ClientsByPhaseChart({ data, total }: Props) {
  const rows = PHASE_ORDER.filter((p) => (data[p] ?? 0) > 0).map((phase) => ({
    phase,
    name: PHASE_LABELS[phase] ?? phase,
    value: data[phase],
  }));
  const sum = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ChartCard
      title="Clients by phase"
      description="Where your clients are right now"
      stat={
        rows.length > 0 && (
          <>
            <p className="text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
              {total}
            </p>
            <p className="text-xs text-dark-500 dark:text-dark-400">clients</p>
          </>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyChart message="No clients yet" />
      ) : (
        <div className="space-y-5">
          <div
            role="img"
            aria-label={`Clients by phase: ${rows
              .map((r) => `${r.name} ${r.value}`)
              .join(', ')}`}
            className="flex h-4 gap-0.5 overflow-hidden rounded-full"
          >
            {rows.map((r) => (
              <div
                key={r.phase}
                title={`${r.name}: ${r.value}`}
                className="min-w-1.5"
                style={{
                  flex: `${r.value} 1 0`,
                  backgroundColor: PHASE_COLORS_HEX[r.phase] ?? '#94A3B8',
                }}
              />
            ))}
          </div>

          <ul className="divide-y divide-line dark:divide-primary-300/10">
            {rows.map((r) => (
              <li
                key={r.phase}
                className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: PHASE_COLORS_HEX[r.phase] ?? '#94A3B8',
                  }}
                />
                <span className="flex-1 text-dark-700 dark:text-dark-200">
                  {r.name}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-dark-500 dark:text-dark-400">
                  {Math.round((r.value / sum) * 100)}%
                </span>
                <span className="w-8 text-right font-semibold tabular-nums text-dark-900 dark:text-white">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

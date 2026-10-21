import { ChartCard, EmptyChart } from './ChartCard';

interface Props {
  globalMargin: number | null;
  byCategory: Record<string, number>;
}

export function MarginsCard({ globalMargin, byCategory }: Props) {
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const max = categories[0]?.[1] || 1;
  const hasData = globalMargin !== null || categories.length > 0;

  return (
    <ChartCard
      title="Material margins"
      description="Mark-up applied on top of material cost"
      stat={
        globalMargin !== null && (
          <>
            <p className="text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
              {globalMargin}%
            </p>
            <p className="text-xs text-dark-500 dark:text-dark-400">default</p>
          </>
        )
      }
    >
      {!hasData ? (
        <EmptyChart message="No margins configured" />
      ) : categories.length === 0 ? (
        <EmptyChart message="No per-category margins set" />
      ) : (
        <ul className="space-y-3">
          {categories.map(([category, margin]) => (
            <li key={category}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="capitalize text-dark-700 dark:text-dark-200">
                  {category}
                </span>
                <span className="font-semibold tabular-nums text-dark-900 dark:text-white">
                  {margin}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-primary-100/80 dark:bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-primary-600 to-secondary-600"
                  style={{ width: `${(margin / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

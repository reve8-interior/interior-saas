import type { UsageMeter } from '@/lib/schemas/auth';
import { meterPercent, meterState, type MeterState } from '@/lib/usage';

const BAR_CLS: Record<MeterState, string> = {
  unlimited: 'bg-dark-300 dark:bg-white/20',
  ok: 'bg-primary-500',
  near: 'bg-amber-500',
  full: 'bg-red-500',
};

const HINT: Partial<Record<MeterState, string>> = {
  near: 'Almost at your plan limit',
  full: 'Limit reached. Upgrade your plan to add more',
};

/** One progress bar per metered limit; text always says how much is used. */
export function UsageMeters({ meters }: { meters: UsageMeter[] }) {
  if (meters.length === 0) return null;
  return (
    <ul className="space-y-3">
      {meters.map((m) => {
        const state = meterState(m.used, m.limit);
        const hint = HINT[state];
        return (
          <li key={m.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{m.label}</span>
              <span className="font-semibold tabular-nums">
                {m.limit === null
                  ? `${m.used.toLocaleString('en-IN')} · Unlimited`
                  : `${m.used.toLocaleString('en-IN')} used, ${m.limit.toLocaleString('en-IN')} allowed`}
              </span>
            </div>
            {m.limit !== null && (
              <div
                role="progressbar"
                aria-label={m.label}
                aria-valuemin={0}
                aria-valuemax={m.limit}
                aria-valuenow={Math.min(m.used, m.limit)}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-dark-100 dark:bg-white/10"
              >
                <div
                  className={`h-full rounded-full ${BAR_CLS[state]}`}
                  style={{ width: `${meterPercent(m.used, m.limit)}%` }}
                />
              </div>
            )}
            {hint && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {hint}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

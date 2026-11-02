import type { AiStatus, UsageMeter } from '@/lib/schemas/auth';

export type MeterState = 'unlimited' | 'ok' | 'near' | 'full';

/** Share of a limit that triggers the upgrade nudge. */
export const NEAR_LIMIT_RATIO = 0.8;

export function meterState(used: number, limit: number | null): MeterState {
  if (limit === null) return 'unlimited';
  if (limit === 0 || used >= limit) return 'full';
  return used / limit >= NEAR_LIMIT_RATIO ? 'near' : 'ok';
}

/** Bar fill, 0-100; an unlimited meter shows no bar. */
export function meterPercent(used: number, limit: number | null): number {
  if (limit === null) return 0;
  if (limit === 0) return 100;
  return Math.min(Math.round((used / limit) * 100), 100);
}

/** Every meter the business has, with AI credits first when AI is on. */
export function usageMeters(
  usage: UsageMeter[],
  ai: AiStatus | undefined
): UsageMeter[] {
  if (!ai?.enabled || ai.monthly_limit === null || ai.remaining === null) {
    return usage;
  }
  const credits: UsageMeter = {
    key: 'ai_credits',
    label: 'AI credits this month',
    used: ai.monthly_limit - ai.remaining,
    limit: ai.monthly_limit,
  };
  return [credits, ...usage];
}

/** The meters that are at or near their limit, fullest first. */
export function meterWarnings(meters: UsageMeter[]): UsageMeter[] {
  const rank = { full: 0, near: 1, ok: 2, unlimited: 2 } as const;
  return meters
    .filter((m) => rank[meterState(m.used, m.limit)] < 2)
    .sort(
      (a, b) =>
        rank[meterState(a.used, a.limit)] - rank[meterState(b.used, b.limit)]
    );
}
